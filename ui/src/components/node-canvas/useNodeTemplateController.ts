import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import {
  createNodeTemplate,
  deleteNodeTemplate,
  instantiateNodeTemplate,
  listNodeTemplates,
  renameNodeTemplate,
} from "../../lib/api-node-templates";
import { commitGraphSnapshot, normalizeTemplateGraph } from "../../lib/nodeStudioGraph";
import type { GraphEdge, GraphNode } from "../../store/useAppStore";
import { useI18n } from "../../i18n";
import type { NodeTemplateSummary } from "./NodeTemplatePicker";

type TemplateOptions = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  fitView(options: { padding: number; duration: number }): Promise<boolean>;
  restoreFocus(): void;
  showToast(message: string, error?: boolean): void;
};

type TemplateSetters = {
  setTemplates: Dispatch<SetStateAction<NodeTemplateSummary[]>>;
  setTemplateError: Dispatch<SetStateAction<string | null>>;
};

export function useNodeTemplateState(options: TemplateOptions) {
  const { t } = useI18n();
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<NodeTemplateSummary[]>([]);
  const openTemplates = useCallback(async () => {
    setTemplateOpen(true); setTemplateLoading(true); setTemplateError(null);
    try { setTemplates(await listNodeTemplates()); }
    catch { setTemplateError(t("nodeStudio.templates.loadError")); }
    finally { setTemplateLoading(false); }
  }, [t]);
  const copyTemplate = useCallback(async (template: NodeTemplateSummary) => {
    if (options.nodes.length > 0 && !window.confirm(t("nodeStudio.templates.replaceConfirm"))) return;
    setTemplateLoading(true); setTemplateError(null);
    try {
      const next = normalizeTemplateGraph(await instantiateNodeTemplate(template.id));
      if (!commitGraphSnapshot({ ...next, reason: "template" })) { setTemplateError(t("nodeStudio.templates.invalidGraph")); return; }
      setTemplateOpen(false); options.restoreFocus();
      requestAnimationFrame(() => void options.fitView({ padding: 0.16, duration: 180 }));
    } catch { setTemplateError(t("nodeStudio.templates.copyError")); }
    finally { setTemplateLoading(false); }
  }, [options, t]);
  return { templateOpen, templateLoading, templateError, templates, setTemplateOpen,
    openTemplates, copyTemplate, setters: { setTemplates, setTemplateError } };
}

export function useNodeTemplateMutations(options: TemplateOptions, setters: TemplateSetters) {
  const { t } = useI18n();
  const saveTemplate = useCallback(async () => {
    const name = window.prompt(t("nodeStudio.templates.namePrompt"));
    if (!name?.trim()) return;
    try {
      const template = await createNodeTemplate({ name: name.trim(), graph: { nodes: options.nodes, edges: options.edges } });
      setters.setTemplates((current) => [...current.filter((item) => item.id !== template.id), template]);
      options.showToast(t("nodeStudio.templates.saved"));
    } catch { options.showToast(t("nodeStudio.templates.saveError"), true); }
  }, [options, setters, t]);
  const renameTemplate = useCallback(async (template: NodeTemplateSummary) => {
    const name = window.prompt(t("nodeStudio.templates.renamePrompt"), template.name);
    if (!name?.trim()) return;
    try {
      const updated = await renameNodeTemplate(template.id, name.trim());
      setters.setTemplates((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch { setters.setTemplateError(t("nodeStudio.templates.renameError")); }
  }, [setters, t]);
  const removeTemplate = useCallback(async (template: NodeTemplateSummary) => {
    try { await deleteNodeTemplate(template.id); setters.setTemplates((current) => current.filter((item) => item.id !== template.id)); }
    catch { setters.setTemplateError(t("nodeStudio.templates.deleteError")); }
  }, [setters, t]);
  return { saveTemplate, renameTemplate, removeTemplate };
}
