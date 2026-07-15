// Higgsfield adapter (050 WP5) — CATALOG ONLY. The user account is on a free
// plan (011 judgment): execution stays locked until entitlement is confirmed,
// and billing/purchase tools are default-denied at this layer regardless.
import type { MediaJobRequest, MediaProviderAdapter, ToolCallPlan } from "../providerAdapter.js";

/** Media-relevant generation tools confirmed in the 73-tool snapshot (011). */
export const HIGGSFIELD_MEDIA_TOOLS = [
  "generate_image",
  "generate_video",
  "generate_audio",
  "generate_3d",
  "reframe",
  "remove_background",
  "outpaint_image",
  "upscale_image",
  "upscale_video",
  "motion_control",
  "animation_actions",
] as const;

/** Money-mutating tools that must never be exposed through ima2 surfaces. */
export const HIGGSFIELD_BILLING_DENYLIST = [
  "confirm_billing_purchase",
  "cancel_trial_auto_renewal",
  "confirm_trial_cancel",
] as const;

const locked = (): never => {
  throw new Error("MCP_EXECUTION_LOCKED:higgsfield (free-plan account; catalog-only per WP5 scope)");
};

export const higgsfieldAdapter: MediaProviderAdapter = {
  provider: "higgsfield",
  // Model catalog is populated at runtime from the read-only `models_explore`
  // tool (no credit consumption); static entries stay empty by design.
  models: { image: [], video: [] },
  executable: false,
  buildGenerateCall: (_request: MediaJobRequest): ToolCallPlan => locked(),
  parseTaskId: () => locked(),
  buildPollCall: () => locked(),
  parsePoll: () => locked(),
};
