import { AGENT_ALLOWED_TOOLS, type AgentToolName } from "./agentTypes.js";
import { BUILTIN_TOOL_CONTRACTS } from "./contracts/builtins.js";

export interface AgentToolManifestEntry {
  name: AgentToolName;
  description: string;
  parameters: Record<string, unknown>;
}

// Projection of the contract catalog SoT (lib/contracts/builtins.ts).
// Edit tool definitions there; this array keeps the historical shape consumed
// by the LLM planner developer prompt, /api/agent/tools, and capabilities.agentMode.
export const AGENT_TOOL_MANIFEST: readonly AgentToolManifestEntry[] = BUILTIN_TOOL_CONTRACTS.map((contract) => ({
  name: contract.name as AgentToolName,
  description: contract.description,
  parameters: contract.inputSchema,
}));

const MANIFEST_NAMES = new Set<string>(AGENT_TOOL_MANIFEST.map((entry) => entry.name));
for (const tool of AGENT_ALLOWED_TOOLS) {
  if (!MANIFEST_NAMES.has(tool)) {
    throw new Error(`Agent tool manifest is missing an entry for: ${tool}`);
  }
}

export function formatToolManifestForPrompt(): string {
  return AGENT_TOOL_MANIFEST
    .map((entry) => `- ${entry.name}: ${entry.description}\n  parameters: ${JSON.stringify(entry.parameters)}`)
    .join("\n");
}
