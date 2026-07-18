import {
  MOTION_EXCLUSIVE_GROUPS,
  type VideoMotionPreset,
} from "../../../lib/videoMotionPresets.js";

export interface MotionSelectionState {
  ids: string[];
  rejected?: { id: string; reason: "LIMIT" | "EXCLUSIVE" };
}

export function toggleMotionPreset(
  state: MotionSelectionState,
  id: string,
  catalog: ReadonlyMap<string, VideoMotionPreset>,
  limit = 3,
): MotionSelectionState {
  if (state.ids.includes(id)) {
    return { ids: state.ids.filter((selectedId) => selectedId !== id) };
  }

  const preset = catalog.get(id);
  if (!preset) {
    throw new Error(`Unknown video motion preset: ${id}`);
  }

  if (state.ids.length >= limit) {
    return reject(state, id, "LIMIT");
  }

  if (hasExclusiveConflict(state.ids, preset, catalog)) {
    return reject(state, id, "EXCLUSIVE");
  }

  return { ids: [...state.ids, id] };
}

function reject(
  state: MotionSelectionState,
  id: string,
  reason: "LIMIT" | "EXCLUSIVE",
): MotionSelectionState {
  return { ids: [...state.ids], rejected: { id, reason } };
}

function hasExclusiveConflict(
  selectedIds: readonly string[],
  preset: VideoMotionPreset,
  catalog: ReadonlyMap<string, VideoMotionPreset>,
): boolean {
  if (!preset.exclusiveGroup) return false;
  const conflictingGroups = MOTION_EXCLUSIVE_GROUPS.get(preset.exclusiveGroup)
    ?? [preset.exclusiveGroup];

  return selectedIds.some((selectedId) => {
    const selectedGroup = catalog.get(selectedId)?.exclusiveGroup;
    return selectedGroup !== undefined && conflictingGroups.includes(selectedGroup);
  });
}
