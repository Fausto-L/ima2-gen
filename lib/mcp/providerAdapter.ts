// Provider adapter contract (050 WP5): normalized media requests <-> provider
// tool calls. Adapters are pure mapping layers — no IO, no persistence.
export type MediaJobKind = "image" | "video";

export interface MediaJobRequest {
  kind: MediaJobKind;
  prompt: string;
  model?: string;
  ratio?: string;
  /** Image-to-video start frame (public HTTPS or provider-hosted URL). */
  startFrameUrl?: string;
  /** Free-text purpose forwarded to providers that require a rationale field. */
  rationale?: string;
}

export interface ToolCallPlan {
  toolName: string;
  args: Record<string, unknown>;
}

export type MediaTaskStatus = "pending" | "running" | "succeeded" | "failed" | "canceled" | "unknown";

export interface MediaTaskPoll {
  status: MediaTaskStatus;
  outputUrls: string[];
  /** Secret-free short diagnostic from the provider (failure reason etc.). */
  detail?: string;
}

export interface MediaProviderAdapter {
  readonly provider: string;
  /** Models the adapter accepts per kind (from verified live schema enums). */
  readonly models: Record<MediaJobKind, readonly string[]>;
  readonly executable: boolean;
  buildGenerateCall(request: MediaJobRequest): ToolCallPlan;
  /** Extract the provider task id from a tools/call result. */
  parseTaskId(result: Record<string, unknown>): string | null;
  buildPollCall(taskId: string): ToolCallPlan;
  parsePoll(result: Record<string, unknown>): MediaTaskPoll;
}

/** Collect every string in an MCP result's content/structuredContent for tolerant parsing. */
export function collectResultText(result: Record<string, unknown>): string {
  const parts: string[] = [];
  const content = result.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string") {
        parts.push((block as { text: string }).text);
      }
    }
  }
  if (result.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent));
  return parts.join("\n");
}

export function extractHttpsUrls(text: string): string[] {
  const matches = text.match(/https:\/\/[^\s"'\\)\]}>]+/g) ?? [];
  return [...new Set(matches)];
}
