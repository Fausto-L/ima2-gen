import type { GraphEdge, GraphNode } from "../store/useAppStore";

export type ElementInputNode = {
  nodeId: string;
  elementId: string | null;
  name: string;
  missing: boolean;
};

/**
 * Collect every element reference node feeding the given targets, walking
 * UPSTREAM through the edge graph (element → A → B is caught when B runs).
 * Direct-only checks miss chained inputs (Socrates B3). Deduped by nodeId.
 */
export function collectElementInputs(
  nodes: GraphNode[],
  edges: GraphEdge[],
  targetIds: string[],
): ElementInputNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const found = new Map<string, ElementInputNode>();
  const queue = [...targetIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.target !== current) continue;
      const source = byId.get(edge.source);
      if (!source) continue;
      if (source.type === "elementReferenceNode") {
        if (!found.has(source.id)) {
          const data = source.data as Record<string, unknown>;
          found.set(source.id, {
            nodeId: source.id,
            elementId: typeof data.elementId === "string" && data.elementId ? data.elementId : null,
            name: (typeof data.elementName === "string" && data.elementName)
              || (typeof data.elementId === "string" && data.elementId)
              || "element",
            missing: data.missing === true,
          });
        }
      } else {
        queue.push(source.id);
      }
    }
  }
  return [...found.values()];
}
