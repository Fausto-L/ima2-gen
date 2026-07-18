import { useCallback, useMemo, useState } from "react";
import { createBranchGraph, type BranchVariant } from "../../lib/nodeBranching";
import { appendBranchOutput, commitGraphSnapshot } from "../../lib/nodeStudioGraph";
import type { GraphEdge, GraphNode } from "../../store/useAppStore";
import { useI18n } from "../../i18n";

type Options = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  fitView(options: { padding: number; duration: number }): Promise<boolean>;
  restoreFocus(): void;
  showToast(message: string, error?: boolean): void;
};

export function useNodeBranchController(options: Options) {
  const { t } = useI18n();
  const [branchOpen, setBranchOpen] = useState(false);
  const selectedSource = useMemo(() => {
    const selected = options.nodes.filter((node) => node.selected && node.type === "imageNode");
    return selected.length === 1 && options.edges.some((edge) => edge.source === selected[0].id)
      ? selected[0]
      : null;
  }, [options.edges, options.nodes]);
  const applyBranch = useCallback((variants: BranchVariant[]) => {
    if (!selectedSource) { options.showToast(t("nodeStudio.branch.selectSourceError"), true); return; }
    const output = createBranchGraph({
      graph: { nodes: options.nodes, edges: options.edges },
      sourceNodeId: selectedSource.id,
      variants,
      axis: "horizontal",
    });
    const candidate = appendBranchOutput({ nodes: options.nodes, edges: options.edges }, output);
    if (!candidate.ok || !commitGraphSnapshot({ ...candidate.graph, reason: "branch" })) {
      options.showToast(t("nodeStudio.branch.applyError"), true); return;
    }
    setBranchOpen(false); options.restoreFocus();
    requestAnimationFrame(() => void options.fitView({ padding: 0.16, duration: 180 }));
  }, [options, selectedSource, t]);
  return { branchOpen, selectedSource, setBranchOpen, applyBranch };
}
