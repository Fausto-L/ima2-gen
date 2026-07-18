import type { GraphEdge, GraphNode } from "../store/storeTypes";

export type NodePortType =
  | "prompt"
  | "image"
  | "images"
  | "video"
  | "mask"
  | "element-refs"
  | "element-notes"
  | "settings"
  | "any-media";

export interface PortDescriptor {
  nodeId: string;
  handleId: string;
  direction: "input" | "output";
  type: NodePortType;
  acceptsMany?: boolean;
}

export interface CompatibilityResult {
  allowed: boolean;
  reason?: "SAME_DIRECTION" | "TYPE_MISMATCH" | "CARDINALITY" | "SELF_EDGE" | "DUPLICATE_EDGE";
}

export interface GraphSnapshot {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
}

const COMPATIBLE_INPUTS: Readonly<Record<NodePortType, readonly NodePortType[]>> = {
  prompt: ["prompt", "element-notes"],
  image: ["image", "images", "mask", "element-refs", "any-media"],
  images: ["images", "element-refs", "any-media"],
  video: ["video", "any-media"],
  mask: ["mask", "any-media"],
  "element-refs": ["image", "images", "element-refs", "any-media"],
  "element-notes": ["prompt", "element-notes"],
  settings: ["settings"],
  "any-media": ["image", "images", "video", "mask", "any-media"],
};

function hasDuplicateEdge(source: PortDescriptor, target: PortDescriptor, edges: readonly GraphEdge[]): boolean {
  return edges.some((edge) =>
    edge.source === source.nodeId
    && edge.target === target.nodeId
    && edge.sourceHandle === source.handleId
    && edge.targetHandle === target.handleId,
  );
}

function hasExistingInput(edgeTarget: PortDescriptor, edges: readonly GraphEdge[]): boolean {
  return edges.some((edge) => edge.target === edgeTarget.nodeId && edge.targetHandle === edgeTarget.handleId);
}

export function canConnectPorts(
  source: PortDescriptor,
  target: PortDescriptor,
  graph: GraphSnapshot,
): CompatibilityResult {
  if (source.direction !== "output" || target.direction !== "input") {
    return { allowed: false, reason: "SAME_DIRECTION" };
  }
  if (source.nodeId === target.nodeId) return { allowed: false, reason: "SELF_EDGE" };
  if (hasDuplicateEdge(source, target, graph.edges)) return { allowed: false, reason: "DUPLICATE_EDGE" };
  if (!COMPATIBLE_INPUTS[source.type].includes(target.type)) {
    return { allowed: false, reason: "TYPE_MISMATCH" };
  }
  if (!target.acceptsMany && hasExistingInput(target, graph.edges)) {
    return { allowed: false, reason: "CARDINALITY" };
  }
  return { allowed: true };
}
