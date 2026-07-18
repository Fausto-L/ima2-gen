import type { PresetProvider } from "./presetCompiler.js";

export interface VideoMotionPreset {
  id: string;
  label: string;
  fragment: string;
  perProvider?: Partial<Record<PresetProvider, string>>;
  exclusiveGroup?: string;
  intensity?: "subtle" | "medium" | "strong";
  maxWith?: number;
}

const CAMERA_MOVEMENT_GROUPS = [
  "dolly-direction",
  "orbit-direction",
  "crane-direction",
  "pan-style",
  "camera-rig",
];

export const MOTION_EXCLUSIVE_GROUPS = new Map<string, readonly string[]>([
  ["dolly-direction", ["dolly-direction", "static-camera"]],
  ["orbit-direction", ["orbit-direction", "static-camera"]],
  ["crane-direction", ["crane-direction", "static-camera"]],
  ["pan-style", ["pan-style", "static-camera"]],
  ["camera-rig", ["camera-rig", "static-camera"]],
  ["temporal-style", ["temporal-style"]],
  ["static-camera", [...CAMERA_MOVEMENT_GROUPS, "static-camera"]],
]);

const presets: VideoMotionPreset[] = [
  { id: "motion-dolly-in", label: "Dolly in", fragment: "slow dolly toward the subject", exclusiveGroup: "dolly-direction", intensity: "subtle", perProvider: { gpt: "Use a slow dolly-in camera move toward the subject.", gemini: "Slow optical dolly-in with a tightening frame on the subject.", grok: "slow dolly in" } },
  { id: "motion-dolly-out", label: "Dolly out", fragment: "dolly away revealing the scene", exclusiveGroup: "dolly-direction", intensity: "medium", perProvider: { gpt: "Dolly the camera away to reveal the scene.", gemini: "Optical dolly-out that widens the framing to reveal the scene.", grok: "dolly out reveal" } },
  { id: "motion-orbit-left", label: "Orbit left", fragment: "orbit left around the subject", exclusiveGroup: "orbit-direction", intensity: "medium", perProvider: { gpt: "Orbit the camera left around the subject.", gemini: "Leftward optical orbit while keeping the subject framed.", grok: "orbit left" } },
  { id: "motion-orbit-right", label: "Orbit right", fragment: "orbit right around the subject", exclusiveGroup: "orbit-direction", intensity: "medium", perProvider: { gpt: "Orbit the camera right around the subject.", gemini: "Rightward optical orbit while keeping the subject framed.", grok: "orbit right" } },
  { id: "motion-crane-up", label: "Crane up", fragment: "crane upward into a wide reveal", exclusiveGroup: "crane-direction", intensity: "medium", perProvider: { gpt: "Crane the camera upward into a wide reveal.", gemini: "Vertical crane-up with expanding wide framing.", grok: "crane up" } },
  { id: "motion-crane-down", label: "Crane down", fragment: "crane downward toward the subject", exclusiveGroup: "crane-direction", intensity: "medium", perProvider: { gpt: "Crane the camera downward toward the subject.", gemini: "Vertical crane-down with framing tightening toward the subject.", grok: "crane down" } },
  { id: "motion-whip-pan", label: "Whip pan", fragment: "rapid whip pan transition", exclusiveGroup: "pan-style", intensity: "strong", perProvider: { gpt: "Use a rapid whip-pan camera transition.", gemini: "Fast horizontal optical pan with intentional motion blur.", grok: "whip pan" } },
  { id: "motion-fpv", label: "FPV", fragment: "dynamic FPV flight path", exclusiveGroup: "camera-rig", intensity: "strong", perProvider: { gpt: "Follow a dynamic FPV camera flight path.", gemini: "Dynamic low-altitude FPV flight with forward optical motion.", grok: "dynamic FPV" } },
  { id: "motion-handheld", label: "Handheld", fragment: "natural handheld camera movement", exclusiveGroup: "camera-rig", intensity: "subtle", perProvider: { gpt: "Use natural, restrained handheld camera movement.", gemini: "Subtle handheld optical drift while maintaining framing.", grok: "natural handheld" } },
  { id: "motion-bullet-time", label: "Bullet time", fragment: "dramatic bullet-time orbit", exclusiveGroup: "temporal-style", intensity: "strong", perProvider: { gpt: "Create a dramatic bullet-time orbit around the subject.", gemini: "Time-slowed orbit with the subject sharply framed.", grok: "bullet-time orbit" } },
  { id: "motion-hyperlapse", label: "Hyperlapse", fragment: "accelerated hyperlapse movement", exclusiveGroup: "temporal-style", intensity: "strong", perProvider: { gpt: "Use accelerated hyperlapse camera movement.", gemini: "Accelerated stabilized forward movement with temporal compression.", grok: "hyperlapse" } },
  { id: "motion-static", label: "Static", fragment: "locked-off static camera", exclusiveGroup: "static-camera", intensity: "subtle", perProvider: { gpt: "Keep the camera locked off and static.", gemini: "Locked-off static framing with no camera movement.", grok: "static camera" } },
];

export const MOTION_PRESETS = new Map(presets.map((preset) => [preset.id, preset]));

export function getMotionFragment(id: string, provider: PresetProvider): string | undefined {
  const preset = MOTION_PRESETS.get(id);
  return preset?.perProvider?.[provider] ?? preset?.fragment;
}
