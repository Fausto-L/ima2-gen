export type SpriteFrameRect = { x: number; y: number; w: number; h: number };

export type SpriteFrameTransform = {
  rotate: number;
  scale: number;
  dx: number;
  dy: number;
  shx: number;
  shy: number;
  flipX: 0 | 1;
};

export type SpriteCurationState = {
  selected?: number[];
  deleted?: number[];
  order?: number[];
  transforms?: Record<string, Partial<SpriteFrameTransform>>;
};

export type SpriteCuration = {
  version: 1;
  kind: "sprite-gen-curation";
  pixel_perfect?: boolean;
  states: Record<string, SpriteCurationState>;
};

export type SpriteManifest = {
  characterId?: string;
  character_id?: string;
  animation: {
    cellWidth: number;
    cellHeight: number;
    rows: Record<string, { row: number; frames: number; fps: number; loop: boolean }>;
  };
  frame_layout: {
    sheetWidth: number;
    sheetHeight: number;
    cellWidth: number;
    cellHeight: number;
    rows: Record<string, SpriteFrameRect[]>;
  };
  [key: string]: unknown;
};

export type SpriteAtlasRunDto = {
  runId: string;
  manifest: SpriteManifest;
  curation: SpriteCuration | null;
  atlasUrl: string;
  manifestUrl?: string;
  curationUrl?: string;
};

export type SpriteCuratorTarget = {
  runId: string;
  atlasFile: string;
  manifestFile: string;
  projectId?: string | null;
};

export type SpriteCuratorDraft = {
  activeState: string;
  curation: SpriteCuration;
  dirty: boolean;
};

export type SpriteFrameView = {
  index: number;
  rect: SpriteFrameRect;
  atlasUrl: string;
  sheetWidth: number;
  sheetHeight: number;
};

export type SpriteBakeResult = { atlasUrl?: string; manifestUrl?: string; reportUrl?: string };
export type SpriteExportResult = { filePath?: string; url?: string; report?: unknown };
export type SpriteUnpackResult = { runId?: string; frameCount?: number };
