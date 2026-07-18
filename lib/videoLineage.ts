import { basename, extname } from "node:path";

export type VideoLineage = {
  id: string;
  parentId: string;
  rootId: string;
  seriesId: string;
  sequenceIndex: number;
};

type VideoMetadata = { videoLineage?: unknown } | null | undefined;

function lineageError(message: string): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code: "VIDEO_LINEAGE_INVALID", status: 500 });
}

function requireMp4Filename(value: unknown, field: string): string {
  if (
    typeof value !== "string"
    || !value.trim()
    || value !== basename(value)
    || extname(value).toLowerCase() !== ".mp4"
  ) {
    throw lineageError(`video lineage ${field} must be a local .mp4 filename`);
  }
  return value;
}

export function normalizeVideoLineage(value: unknown): VideoLineage | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw lineageError("video lineage must be an object");
  }
  const raw = value as Partial<VideoLineage>;
  if (!Number.isInteger(raw.sequenceIndex) || (raw.sequenceIndex as number) < 0) {
    throw lineageError("video lineage sequenceIndex must be a non-negative integer");
  }
  return {
    id: requireMp4Filename(raw.id, "id"),
    parentId: requireMp4Filename(raw.parentId, "parentId"),
    rootId: requireMp4Filename(raw.rootId, "rootId"),
    seriesId: requireMp4Filename(raw.seriesId, "seriesId"),
    sequenceIndex: raw.sequenceIndex as number,
  };
}

export function deriveChildVideoLineage(
  childFilename: string,
  parentFilename: string,
  parentMetadata: VideoMetadata,
): VideoLineage {
  const childId = requireMp4Filename(childFilename, "id");
  const parentId = requireMp4Filename(parentFilename, "parentId");
  const parent = normalizeVideoLineage(parentMetadata?.videoLineage);
  if (parent && parent.id !== parentId) {
    throw lineageError("video lineage id does not match its sidecar filename");
  }
  return {
    id: childId,
    parentId,
    rootId: parent?.rootId ?? parentId,
    seriesId: parent?.seriesId ?? parentId,
    sequenceIndex: (parent?.sequenceIndex ?? 0) + 1,
  };
}
