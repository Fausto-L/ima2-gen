import type { GraphEdge, GraphNode, ImageNodeData } from "../store/storeTypes";
import type { GraphSnapshot } from "./nodeCompatibility";

export interface BranchVariant {
  id: string;
  label: string;
  provider?: string;
  settingsPatch: Partial<ImageNodeData>;
}

export interface BranchGraphInput {
  graph: GraphSnapshot;
  sourceNodeId: string;
  variants: readonly BranchVariant[];
  axis: "horizontal" | "vertical";
}

export interface BranchGraphOutput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  createdNodeIds: string[];
  createdEdgeIds: string[];
}

const BRANCH_SPACING = 320;
const BRANCH_OFFSET = 420;

function emptyOutput(): BranchGraphOutput {
  return { nodes: [], edges: [], createdNodeIds: [], createdEdgeIds: [] };
}

function hasUniqueVariants(variants: readonly BranchVariant[]): boolean {
  return new Set(variants.map((variant) => variant.id)).size === variants.length;
}

function allocateId(base: string, usedIds: Set<string>): string {
  let suffix = 1;
  let id = base;
  while (usedIds.has(id)) id = `${base}-${suffix++}`;
  usedIds.add(id);
  return id;
}

function cloneData(data: ImageNodeData): ImageNodeData {
  return JSON.parse(JSON.stringify(data)) as ImageNodeData;
}

function branchPosition(node: GraphNode, index: number, axis: BranchGraphInput["axis"], graph: GraphSnapshot) {
  const offset = (index - 0.5) * BRANCH_SPACING;
  const boundary = Math.max(0, ...graph.nodes.map((candidate) =>
    axis === "horizontal" ? candidate.position.x : candidate.position.y,
  ));
  return axis === "horizontal"
    ? { x: boundary + BRANCH_OFFSET, y: node.position.y + offset }
    : { x: node.position.x + offset, y: boundary + BRANCH_OFFSET };
}

function cloneNode(template: GraphNode, id: string, variant: BranchVariant, position: { x: number; y: number }, applyVariant: boolean): GraphNode {
  const data = { ...cloneData(template.data), ...(applyVariant ? variant.settingsPatch : {}), clientId: id, serverNodeId: null,
    parentServerNodeId: null, pendingRequestId: null, pendingPhase: null, status: "empty" as const } as ImageNodeData & { provider?: string };
  if (applyVariant && variant.provider) data.provider = variant.provider;
  return { ...template, id, position, data };
}

function cloneEdge(edge: GraphEdge, source: string, target: string, usedIds: Set<string>): GraphEdge {
  const id = allocateId(`${source}:${edge.sourceHandle ?? "auto"}->${target}:${edge.targetHandle ?? "auto"}`, usedIds);
  return { ...edge, id, source, target };
}

function findTemplate(input: BranchGraphInput): { generator: GraphNode; inputEdges: GraphEdge[] } | null {
  const source = input.graph.nodes.find((node) => node.id === input.sourceNodeId);
  const sourceEdge = input.graph.edges.find((edge) => edge.source === input.sourceNodeId);
  const generator = sourceEdge && input.graph.nodes.find((node) => node.id === sourceEdge.target);
  const inputEdges = generator ? input.graph.edges.filter((edge) => edge.target === generator.id) : [];
  return source && generator && inputEdges.length > 0 ? { generator, inputEdges } : null;
}

export function createBranchGraph(input: BranchGraphInput): BranchGraphOutput {
  if (input.variants.length < 2 || input.variants.length > 4 || !hasUniqueVariants(input.variants)) return emptyOutput();
  const template = findTemplate(input);
  if (!template) return emptyOutput();

  const usedNodeIds = new Set(input.graph.nodes.map((node) => node.id));
  const usedEdgeIds = new Set(input.graph.edges.map((edge) => edge.id));
  const resultEdge = input.graph.edges.find((edge) => edge.source === template.generator.id);
  const resultTemplate = resultEdge && input.graph.nodes.find((node) => node.id === resultEdge.target);
  if (resultEdge && !resultTemplate) return emptyOutput();

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const [index, variant] of input.variants.entries()) {
    const generatorId = allocateId(`${template.generator.id}-branch-${variant.id}`, usedNodeIds);
    const generatorPosition = branchPosition(template.generator, index, input.axis, input.graph);
    const generator = cloneNode(template.generator, generatorId, variant, generatorPosition, true);
    nodes.push(generator);
    for (const inputEdge of template.inputEdges) {
      edges.push(cloneEdge(inputEdge, inputEdge.source, generatorId, usedEdgeIds));
    }
    if (resultTemplate && resultEdge) {
      const resultId = allocateId(`${resultTemplate.id}-branch-${variant.id}`, usedNodeIds);
      const resultPosition = {
        x: generatorPosition.x + resultTemplate.position.x - template.generator.position.x,
        y: generatorPosition.y + resultTemplate.position.y - template.generator.position.y,
      };
      const result = cloneNode(resultTemplate, resultId, variant, resultPosition, false);
      nodes.push(result);
      edges.push(cloneEdge(resultEdge, generatorId, resultId, usedEdgeIds));
    }
  }
  return { nodes, edges, createdNodeIds: nodes.map((node) => node.id), createdEdgeIds: edges.map((edge) => edge.id) };
}
