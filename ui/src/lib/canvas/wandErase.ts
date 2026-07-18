/**
 * Click-to-erase ("magic wand") for the keying panel (devlog 260715 assetgen
 * ux overhaul 032). Each seed click flood-fills the contiguous region whose
 * color stays within tolerance of the clicked pixel and zeroes its alpha.
 *
 * Same contract as the canvas-mode engine (backgroundRemoval.ts): max-channel
 * color distance, 4-connectivity, alpha-0 pixels never traversed. Kept
 * self-contained (no runtime imports) so node:test can drive it directly.
 */

import type { NormalizedPoint } from "../../types/canvas";
import type { PixelBuffer } from "./colorKey";

/** Map the keying panel's 0-100 removal strength onto a byte tolerance. */
export function wandByteTolerance(strength: number): number {
  return Math.round(Math.max(0, Math.min(100, strength)) * 0.7);
}

function pointToIndex(point: NormalizedPoint, width: number, height: number): number {
  const x = Math.max(0, Math.min(width - 1, Math.round(point.x * (width - 1))));
  const y = Math.max(0, Math.min(height - 1, Math.round(point.y * (height - 1))));
  return y * width + x;
}

function withinTolerance(
  data: Uint8ClampedArray,
  offset: number,
  colors: Array<{ r: number; g: number; b: number }>,
  tolerance: number,
): boolean {
  for (const c of colors) {
    const distance = Math.max(
      Math.abs(data[offset] - c.r),
      Math.abs(data[offset + 1] - c.g),
      Math.abs(data[offset + 2] - c.b),
    );
    if (distance <= tolerance) return true;
  }
  return false;
}

function floodFillSeeds(
  source: PixelBuffer,
  seeds: NormalizedPoint[],
  tolerance: number,
): Uint8Array {
  const { width, height, data } = source;
  const totalPixels = width * height;
  const mask = new Uint8Array(totalPixels);
  const visited = new Uint8Array(totalPixels);
  const stack = new Int32Array(totalPixels);
  const colors = seeds.map((seed) => {
    const offset = pointToIndex(seed, width, height) * 4;
    return { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
  });
  let top = 0;
  const push = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    if (data[index * 4 + 3] === 0) return;
    if (!withinTolerance(data, index * 4, colors, tolerance)) return;
    stack[top++] = index;
  };
  for (const seed of seeds) push(pointToIndex(seed, width, height));
  while (top > 0) {
    const index = stack[--top];
    mask[index] = 1;
    const x = index % width;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (index >= width) push(index - width);
    if (index < totalPixels - width) push(index + width);
  }
  return mask;
}

/**
 * Erase every seed-connected region from `target` (alpha 0). Region matching
 * runs against `source` (the ORIGINAL pixels) so wand clicks behave the same
 * regardless of what the color key already removed. Mutates `target` in place.
 */
export function eraseSeedRegions(
  target: PixelBuffer,
  source: PixelBuffer,
  seeds: NormalizedPoint[],
  strength: number,
): void {
  if (seeds.length === 0) return;
  if (
    target.width !== source.width ||
    target.height !== source.height ||
    target.data.length !== source.data.length
  ) {
    throw new Error("wandErase: target/source buffer size mismatch");
  }
  const mask = floodFillSeeds(source, seeds, wandByteTolerance(strength));
  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) target.data[p * 4 + 3] = 0;
  }
}
