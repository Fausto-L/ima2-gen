/**
 * Global color-key for asset-gen keying (devlog 260715_asset_gen_mode/021).
 *
 * Unlike backgroundRemoval.ts (contiguous flood-fill from corner seeds), this
 * keys EVERY pixel whose chroma distance to the key color falls inside the
 * tolerance, with a soft feather band and green-spill suppression at the edge.
 * The core is DOM-independent (plain pixel buffers) so node:test can drive it.
 */

export type RGB = { r: number; g: number; b: number };

export type ColorKeyParams = {
  keyColor: RGB;
  /** 0-100. Chroma distance keyed to alpha 0. Default 40. */
  tolerance: number;
  /** 0-50. Feather band width past tolerance (partial alpha). Default 10. */
  softness: number;
  /** 0-100. Spill suppression strength inside the feather band. Default 30. */
  spill: number;
};

export const DEFAULT_COLOR_KEY_PARAMS: Omit<ColorKeyParams, "keyColor"> = {
  tolerance: 40,
  softness: 10,
  spill: 50,
};

export type PixelBuffer = { width: number; height: number; data: Uint8ClampedArray };

function toCbCr(r: number, g: number, b: number): [number, number] {
  // BT.601 chroma components; luma-free so shadows keep keying reliably.
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return [cb, cr];
}

function toY(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Border-contiguity gate for achromatic (white/black/gray) keys.
 * Keyed pixels must reach the image border through other keyed pixels;
 * anything enclosed by the subject (white glints on a face, black buttons)
 * is pushed back to fully opaque. Mutates `smoothDist` in place.
 */
function gateToBorderConnected(
  smoothDist: Float32Array,
  width: number,
  height: number,
  t1: number,
): void {
  const pixelCount = width * height;
  const matched = new Uint8Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) if (smoothDist[p] < t1) matched[p] = 1;
  const reachable = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const push = (p: number) => {
    if (matched[p] && !reachable[p]) {
      reachable[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }
  for (let p = 0; p < pixelCount; p++) {
    if (matched[p] && !reachable[p]) smoothDist[p] = t1;
  }
}

/** Median of the four 4x4 corner patches — robust default key color. */
export function sampleKeyColor(img: PixelBuffer): RGB {
  const { width, height, data } = img;
  if (width < 2 || height < 2 || data.length < width * height * 4) {
    throw new Error("colorKey: image too small or malformed pixel buffer");
  }
  const patch = 4;
  const xs = [0, Math.max(0, width - patch)];
  const ys = [0, Math.max(0, height - patch)];
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (const px of xs) for (const py of ys) {
    for (let y = py; y < Math.min(py + patch, height); y++) {
      for (let x = px; x < Math.min(px + patch, width); x++) {
        const i = (y * width + x) * 4;
        rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
      }
    }
  }
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return { r: median(rs), g: median(gs), b: median(bs) };
}

/**
 * Apply the global color key. Returns a NEW buffer; the input is untouched.
 * Throws on empty/malformed buffers (activation scenario: WP5 accept #6).
 */
export function applyColorKey(src: PixelBuffer, params: ColorKeyParams): PixelBuffer {
  const { width, height, data } = src;
  if (!width || !height || data.length !== width * height * 4) {
    throw new Error("colorKey: empty or malformed pixel buffer");
  }
  const tolerance = Math.max(0, Math.min(100, params.tolerance));
  const softness = Math.max(0, Math.min(50, params.softness));
  const spill = Math.max(0, Math.min(100, params.spill)) / 100;
  // Map UI ranges onto CbCr distance: 100 tolerance ≈ distance 120.
  const t0 = (tolerance / 100) * 120;
  const t1 = t0 + (softness / 100) * 120;
  const [keyCb, keyCr] = toCbCr(params.keyColor.r, params.keyColor.g, params.keyColor.b);

  // Detect whether the key color is green-ish. The green-specific despill
  // (avg-limiter + edge hard clamp) only makes sense for green screens;
  // applying it to black/white/blue keys destroys the foreground.
  const kR = params.keyColor.r, kG = params.keyColor.g, kB = params.keyColor.b;
  const isGreenKey = kG > kR + 20 && kG > kB + 20 && kG > 60;

  // Detect achromatic keys (black/white/gray). For these, pure CbCr
  // distance fails because foreground and background share similar chroma
  // (both near the neutral point). We blend luminance (Y) into the
  // distance so brightness differences separate fg from bg.
  const keySaturation = Math.max(kR, kG, kB) - Math.min(kR, kG, kB);
  const isAchromaticKey = keySaturation < 40;
  const keyY = toY(kR, kG, kB);
  // Achromatic keys must match ONLY genuinely neutral pixels. Colored
  // pixels (skin, warm shadows) may share the key's brightness but must
  // never key — this is what previously ate faces and legs on white keys.
  // The cap grows mildly with tolerance (16 at the default 40).
  const achromaChromaCap = 10 + (tolerance / 100) * 15;
  // Sentinel distance far beyond any reachable CbCr+luma distance.
  const NEVER_KEY = 400;

  // --- Pass 1: compute per-pixel CbCr distance ---
  const pixelCount = width * height;
  const distBuf = new Float32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [cb, cr] = toCbCr(r, g, b);
    const chromaDist = Math.hypot(cb - keyCb, cr - keyCr);
    if (isAchromaticKey) {
      if (chromaDist > achromaChromaCap) {
        // Saturated pixel — never key it on a white/black background.
        distBuf[p] = NEVER_KEY;
      } else {
        // For achromatic keys, add weighted luma distance so brightness
        // differences (skin vs black bg, white shirt vs white bg) contribute.
        // Scale Y difference to be comparable to CbCr distance range.
        const lumaDist = Math.abs(toY(r, g, b) - keyY) * 0.8;
        distBuf[p] = Math.hypot(chromaDist, lumaDist);
      }
    } else {
      distBuf[p] = chromaDist;
    }
  }

  // --- Pass 2: 3×3 box-filter the distance (OBS-style edge smoothing) ---
  const smoothDist = new Float32Array(pixelCount);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      // Never-key sentinels stay hard and must not bleed into the average
      // of neighbouring background pixels (would leave a bright halo).
      if (distBuf[p] >= NEVER_KEY) {
        smoothDist[p] = NEVER_KEY;
        continue;
      }
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const d = distBuf[ny * width + nx];
          if (d >= NEVER_KEY) continue;
          sum += d;
          count++;
        }
      }
      smoothDist[p] = count > 0 ? sum / count : NEVER_KEY;
    }
  }

  // --- Pass 2.5 (achromatic keys only): border-contiguity gate ---
  // "Remove only the background": keyed pixels must connect to the image
  // border through other keyed pixels. Highlights enclosed by the subject
  // stay opaque instead of punching holes in the face.
  if (isAchromaticKey) {
    gateToBorderConnected(smoothDist, width, height, t1);
  }

  // --- Pass 3: alpha + despill (OBS/ffmpeg-style, alpha-independent) ---
  // Despill band extends past the feather into opaque foreground.
  const despillBand = t1 + spill * 120;
  const out = new Uint8ClampedArray(data.length);
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    const dist = smoothDist[p];

    // Alpha ramp with OBS-style power curve.
    let alpha: number;
    if (dist <= t0) alpha = 0;
    else if (dist < t1) alpha = Math.pow((dist - t0) / (t1 - t0), 1.5) * 255;
    else alpha = 255;

    // Despill: avg-limiter (Natron mix=0.5 / ffmpeg style) weighted by
    // proximity to the key color. Applied to ALL alpha>0 pixels, not just
    // the feather band — this is the critical fix for opaque-foreground
    // green fringe (OBS/Nuke do the same).
    let outR = r, outG = g, outB = b;
    if (isGreenKey && spill > 0 && alpha > 0) {
      // Distance-based weight: 1 at key edge, fading to 0 at despillBand.
      const w = despillBand > t0
        ? Math.max(0, 1 - (dist - t0) / (despillBand - t0))
        : 0;
      if (w > 0) {
        // Avg-limiter spillmap: how much G exceeds the average of R and B.
        const limit = (r + b) / 2;
        const spillmap = Math.max(0, g - limit);
        const correction = spillmap * w * spill;
        outG = Math.round(g - correction);
        // Compensate brightness: redistribute half the removed green into
        // R and B to preserve perceived luminance (avoids darkening hair).
        const compensate = correction * 0.3;
        outR = Math.min(255, Math.round(r + compensate));
        outB = Math.min(255, Math.round(b + compensate));
      }
    }

    out[i] = outR; out[i + 1] = outG; out[i + 2] = outB;
    out[i + 3] = Math.min(a, Math.round(alpha));
  }

  // --- Pass 4: edge-morphological hard despill ("regex" pass) ---
  // Pattern-match "edge + green-biased" pixels and hard-clamp the green.
  // Dilate the edge band 4× (~5px deep) to catch AI-generated green that
  // extends several pixels into hair strands.
  // ONLY for green keys — applying this to black/white keys would destroy
  // the foreground (the G channel is not special for non-green keys).
  if (isGreenKey && spill > 0) {
    let edgeBand = new Uint8Array(pixelCount);
    // Mark edge pixels: alpha>0 with at least one alpha=0 in 3×3.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (out[p * 4 + 3] === 0) continue;
        let near = false;
        check: for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (out[(ny * width + nx) * 4 + 3] === 0) {
              near = true;
              break check;
            }
          }
        }
        if (near) edgeBand[p] = 1;
      }
    }
    // Dilate edge band 3 more times → ~4-5px deep fringe coverage.
    for (let iter = 0; iter < 3; iter++) {
      const next = new Uint8Array(pixelCount);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = y * width + x;
          if (edgeBand[p]) { next[p] = 1; continue; }
          if (out[p * 4 + 3] === 0) continue;
          let found = false;
          for (let dy = -1; dy <= 1 && !found; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -1; dx <= 1 && !found; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              if (edgeBand[ny * width + nx]) found = true;
            }
          }
          if (found) next[p] = 1;
        }
      }
      edgeBand = next;
    }
    // Hard clamp: for edge-band pixels where G exceeds max(R,B) by any
    // amount (threshold -8 to also catch subtle green bias), clamp it.
    for (let p = 0; p < pixelCount; p++) {
      if (!edgeBand[p]) continue;
      const i = p * 4;
      const r = out[i], g = out[i + 1], b = out[i + 2];
      const cap = Math.max(r, b);
      // Clamp when G exceeds cap, with a small threshold so subtle green
      // bias on gray/white hair is also caught.
      if (g > cap - 8) {
        const target = Math.max(0, cap - 4);
        const excess = Math.max(0, g - target);
        out[i + 1] = Math.max(0, g - excess);
        // Brightness compensation.
        out[i] = Math.min(255, r + Math.round(excess * 0.25));
        out[i + 2] = Math.min(255, b + Math.round(excess * 0.25));
      }
    }
  }

  return { width, height, data: out };
}
