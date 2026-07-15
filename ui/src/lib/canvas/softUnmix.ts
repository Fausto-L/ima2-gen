/**
 * Soft-alpha unmix + trapped-spill despill (devlog 260715_spritegen-adoption/010).
 *
 * Port of sprite-gen's chroma boundary cleanup (extract.py:42-246, Apache-2.0,
 * aldegad/sprite-gen). Boundary pixels are modeled as a linear blend
 * `obs = (1-k)*subject + k*key`; we recover the subject color and coverage
 * instead of erasing the antialiased band (their v1.13 lesson).
 *
 * Adaptations agreed in the WP2 audit:
 * - `obs` is ALWAYS the SOURCE pixel (applyColorKey already despilled the
 *   keyed buffer's RGB — feeding that back would double-correct).
 * - The hard-key region is `keyed.alpha === 0` (whatever applyColorKey cut).
 * - Unmixed band pixels get BOTH their RGB and alpha overwritten in `keyed`.
 * - Trapped-spill clusters use 8-connectivity like the original.
 * DOM-independent; node:test drives it directly.
 */

import type { PixelBuffer, RGB } from "./colorKey";

export type SoftUnmixParams = {
  keyColor: RGB;
  /** Chebyshev reach from the hard-keyed region. 0 disables. Original default 4. */
  reach: number;
  /** Max trapped-spill cluster size as a fraction of subject pixels. Original 0.005. */
  spillMaxFraction: number;
};

export const DEFAULT_SOFT_UNMIX_PARAMS: Omit<SoftUnmixParams, "keyColor"> = {
  reach: 4,
  spillMaxFraction: 0.005,
};

const FRINGE_DELTA = 18;
const FRINGE_THRESHOLD = 180;
const SPILL_MIN_TINT = 40;
const IN_BAND_UNMIX_KEY_DEPTH = 2;

const CLASS_KEYED = 0;
const CLASS_SUBJECT = 1;
const CLASS_IN_BAND = 2;
const CLASS_OUT_OF_BAND = 3;

type ChannelSets = { keyed: number[]; unkeyed: number[] };

/**
 * Original classification (extract.py:42-49): keyed channels are >=192,
 * unkeyed are <64. A mid-range channel makes the key unsupported (audit
 * residual guard) and the whole pass a no-op, as does an empty set — this
 * naturally rejects white/black keys.
 */
export function keyChannelSets(key: RGB): ChannelSets | null {
  const channels = [key.r, key.g, key.b];
  const keyed: number[] = [];
  const unkeyed: number[] = [];
  for (let i = 0; i < 3; i++) {
    if (channels[i] >= 192) keyed.push(i);
    else if (channels[i] < 64) unkeyed.push(i);
    else return null;
  }
  if (keyed.length === 0 || unkeyed.length === 0) return null;
  return { keyed, unkeyed };
}

/** T(C): mean of keyed channels minus mean of unkeyed channels. */
export function keyTintScore(r: number, g: number, b: number, sets: ChannelSets): number {
  const channels = [r, g, b];
  let keyedSum = 0;
  for (const i of sets.keyed) keyedSum += channels[i];
  let unkeyedSum = 0;
  for (const i of sets.unkeyed) unkeyedSum += channels[i];
  return keyedSum / sets.keyed.length - unkeyedSum / sets.unkeyed.length;
}

function colorDistance(r: number, g: number, b: number, key: RGB): number {
  return Math.hypot(r - key.r, g - key.g, b - key.b);
}

/** Blend-model inversion: returns [coverage, r, g, b] of the subject estimate. */
function despillColor(
  r: number, g: number, b: number, key: RGB, keyTint: number, tint: number,
): [number, number, number, number] {
  const k = Math.min(tint / keyTint, 1);
  const coverage = 1 - k;
  if (coverage <= 0) return [0, 0, 0, 0];
  const restore = (c: number, kc: number) =>
    Math.min(255, Math.max(0, Math.round((c - k * kc) / coverage)));
  return [coverage, restore(r, key.r), restore(g, key.g), restore(b, key.b)];
}

/** Chebyshev distance map from keyed seeds via 8-neighbour BFS, capped at reach. */
function computeKeyDepth(
  keyedAlphaZero: Uint8Array, width: number, height: number, reach: number,
): Uint8Array {
  const total = width * height;
  const UNSEEN = 255;
  const depths = new Uint8Array(total).fill(UNSEEN);
  let frontier: number[] = [];
  for (let p = 0; p < total; p++) {
    if (keyedAlphaZero[p]) { depths[p] = 0; frontier.push(p); }
  }
  let depth = 0;
  while (frontier.length > 0 && depth < reach) {
    depth++;
    const next: number[] = [];
    for (const index of frontier) {
      const x = index % width;
      const y = (index - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (depths[neighbor] === UNSEEN) { depths[neighbor] = depth; next.push(neighbor); }
        }
      }
    }
    frontier = next;
  }
  return depths;
}

function classifyPixels(
  source: PixelBuffer, keyed: PixelBuffer, key: RGB, sets: ChannelSets,
): { classes: Uint8Array; keyedMask: Uint8Array } {
  const total = source.width * source.height;
  const classes = new Uint8Array(total);
  const keyedMask = new Uint8Array(total);
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    if (keyed.data[i + 3] === 0) { classes[p] = CLASS_KEYED; keyedMask[p] = 1; continue; }
    const r = source.data[i], g = source.data[i + 1], b = source.data[i + 2];
    if (keyTintScore(r, g, b, sets) < FRINGE_DELTA) classes[p] = CLASS_SUBJECT;
    else if (colorDistance(r, g, b, key) <= FRINGE_THRESHOLD) classes[p] = CLASS_IN_BAND;
    else classes[p] = CLASS_OUT_OF_BAND;
  }
  return { classes, keyedMask };
}

function unmixBand(
  keyed: PixelBuffer, source: PixelBuffer, key: RGB, sets: ChannelSets,
  keyTint: number, depths: Uint8Array, classes: Uint8Array, reach: number,
): Uint8Array {
  const total = source.width * source.height;
  const unmixed = new Uint8Array(total);
  for (let p = 0; p < total; p++) {
    const depth = depths[p];
    if (!(depth > 0 && depth <= reach)) continue;
    const cls = classes[p];
    if (cls === CLASS_IN_BAND) {
      if (depth > IN_BAND_UNMIX_KEY_DEPTH) continue;
    } else if (cls !== CLASS_OUT_OF_BAND) continue;
    const i = p * 4;
    const r = source.data[i], g = source.data[i + 1], b = source.data[i + 2];
    const tint = keyTintScore(r, g, b, sets);
    const [coverage, nr, ng, nb] = despillColor(r, g, b, key, keyTint, tint);
    const outAlpha = Math.round(source.data[i + 3] * coverage);
    if (outAlpha <= 0) {
      keyed.data[i] = 0; keyed.data[i + 1] = 0; keyed.data[i + 2] = 0; keyed.data[i + 3] = 0;
    } else {
      keyed.data[i] = nr; keyed.data[i + 1] = ng; keyed.data[i + 2] = nb;
      keyed.data[i + 3] = outAlpha;
    }
    unmixed[p] = 1;
  }
  return unmixed;
}

function despillTrappedClusters(
  keyed: PixelBuffer, source: PixelBuffer, key: RGB, sets: ChannelSets,
  keyTint: number, classes: Uint8Array, unmixed: Uint8Array, spillMaxFraction: number,
): void {
  const { width, height } = source;
  const total = width * height;
  let subjectCount = 0;
  for (let p = 0; p < total; p++) if (classes[p] !== CLASS_KEYED) subjectCount++;
  const spillLimit = Math.max(32, Math.round(subjectCount * spillMaxFraction));
  // Residual tint detection runs on SOURCE colors, excluding already-unmixed pixels.
  const tints = new Float32Array(total).fill(-1);
  for (let p = 0; p < total; p++) {
    if (unmixed[p] || classes[p] === CLASS_KEYED) continue;
    const i = p * 4;
    if (keyed.data[i + 3] === 0) continue;
    const tint = keyTintScore(source.data[i], source.data[i + 1], source.data[i + 2], sets);
    if (tint >= FRINGE_DELTA) tints[p] = tint;
  }
  const visited = new Uint8Array(total);
  const stack: number[] = [];
  for (let start = 0; start < total; start++) {
    if (tints[start] < 0 || visited[start]) continue;
    visited[start] = 1;
    stack.length = 0;
    stack.push(start);
    const cluster: number[] = [];
    let maxTint = -1;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cluster.push(index);
      if (tints[index] > maxTint) maxTint = tints[index];
      const x = index % width;
      const y = (index - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (tints[neighbor] >= 0 && !visited[neighbor]) { visited[neighbor] = 1; stack.push(neighbor); }
        }
      }
    }
    if (cluster.length > spillLimit) continue;
    if (maxTint <= SPILL_MIN_TINT) continue;
    for (const index of cluster) {
      const i = index * 4;
      const r = source.data[i], g = source.data[i + 1], b = source.data[i + 2];
      const [coverage, nr, ng, nb] = despillColor(r, g, b, key, keyTint, tints[index]);
      if (coverage <= 0) continue;
      // Color correction only — alpha stays exactly as the keyer produced it.
      keyed.data[i] = nr; keyed.data[i + 1] = ng; keyed.data[i + 2] = nb;
    }
  }
}

/**
 * Apply soft-alpha unmix + trapped-spill despill to `keyed` in place, reading
 * blend evidence from `source`. No-op for unsupported (non-extreme) keys.
 */
export function applySoftUnmix(
  keyed: PixelBuffer, source: PixelBuffer, params: SoftUnmixParams,
): void {
  if (
    !keyed.width || !keyed.height ||
    keyed.width !== source.width || keyed.height !== source.height ||
    keyed.data.length !== source.data.length ||
    keyed.data.length !== keyed.width * keyed.height * 4
  ) {
    throw new Error("softUnmix: empty or mismatched pixel buffers");
  }
  const sets = keyChannelSets(params.keyColor);
  if (!sets) return;
  const keyTint = keyTintScore(params.keyColor.r, params.keyColor.g, params.keyColor.b, sets);
  if (keyTint <= 0) return;
  const reach = Math.max(0, Math.min(254, Math.round(params.reach)));
  const { classes, keyedMask } = classifyPixels(source, keyed, params.keyColor, sets);
  let unmixed: Uint8Array;
  if (reach > 0) {
    const depths = computeKeyDepth(keyedMask, source.width, source.height, reach);
    unmixed = unmixBand(keyed, source, params.keyColor, sets, keyTint, depths, classes, reach);
  } else {
    unmixed = new Uint8Array(source.width * source.height);
  }
  if (params.spillMaxFraction > 0) {
    despillTrappedClusters(
      keyed, source, params.keyColor, sets, keyTint, classes, unmixed, params.spillMaxFraction,
    );
  }
}
