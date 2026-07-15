import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applySoftUnmix,
  keyChannelSets,
  keyTintScore,
  DEFAULT_SOFT_UNMIX_PARAMS,
} from "../ui/src/lib/canvas/softUnmix.ts";
import type { PixelBuffer } from "../ui/src/lib/canvas/colorKey.ts";

const GREEN = { r: 0, g: 255, b: 0 };
const SUBJECT = { r: 200, g: 40, b: 40 };

function makeImage(width: number, height: number, c = { r: 0, g: 0, b: 0 }, alpha = 255): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; data[i + 3] = alpha;
  }
  return { width, height, data };
}

function setPx(img: PixelBuffer, x: number, y: number, r: number, g: number, b: number, a = 255) {
  const i = (y * img.width + x) * 4;
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
}

function px(img: PixelBuffer, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

function clone(img: PixelBuffer): PixelBuffer {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

describe("keyChannelSets / keyTintScore", () => {
  it("classifies extreme keys and rejects mid-channel or achromatic keys", () => {
    assert.deepEqual(keyChannelSets(GREEN), { keyed: [1], unkeyed: [0, 2] });
    assert.deepEqual(keyChannelSets({ r: 255, g: 0, b: 255 }), { keyed: [0, 2], unkeyed: [1] });
    assert.equal(keyChannelSets({ r: 255, g: 255, b: 255 }), null, "white: no unkeyed set");
    assert.equal(keyChannelSets({ r: 10, g: 10, b: 10 }), null, "black: no keyed set");
    assert.equal(keyChannelSets({ r: 255, g: 0, b: 128 }), null, "mid channel rejected");
  });
  it("scores the key itself at max tint", () => {
    const sets = keyChannelSets(GREEN)!;
    assert.equal(keyTintScore(0, 255, 0, sets), 255);
    assert.equal(keyTintScore(200, 40, 40, sets) < 0, true, "warm subject is negative");
  });
});

describe("applySoftUnmix", () => {
  it("separates a 50% green-blend boundary pixel into a zero-tint subject + partial alpha", () => {
    // Layout: column 0-1 = hard-keyed bg (alpha 0 in keyed), column 2 = 50% blend, column 3+ = subject.
    // Contract per extract.py despill_color docstring: k = tint/keyTint recovers
    // a subject estimate whose own tint score is ~0 — NOT the true subject color
    // when the subject tint is negative. Assert that contract analytically.
    const W = 12, H = 6;
    const source = makeImage(W, H, GREEN);
    const keyed = makeImage(W, H, GREEN);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x <= 1; x++) setPx(keyed, x, y, 0, 0, 0, 0); // hard-keyed
      const blend = { r: (SUBJECT.r + GREEN.r) / 2, g: (SUBJECT.g + GREEN.g) / 2, b: (SUBJECT.b + GREEN.b) / 2 };
      setPx(source, 2, y, blend.r, blend.g, blend.b);
      setPx(keyed, 2, y, blend.r, blend.g, blend.b, 255);
      for (let x = 3; x < W; x++) { setPx(source, x, y, SUBJECT.r, SUBJECT.g, SUBJECT.b); setPx(keyed, x, y, SUBJECT.r, SUBJECT.g, SUBJECT.b, 255); }
    }
    applySoftUnmix(keyed, source, { keyColor: GREEN, ...DEFAULT_SOFT_UNMIX_PARAMS });
    const [r, g, b, a] = px(keyed, 2, 3);
    const sets = keyChannelSets(GREEN)!;
    const blendTint = keyTintScore(100, 147.5, 20, sets); // 87.5 for this fixture
    const expectedAlpha = Math.round(255 * (1 - blendTint / 255)); // ≈167
    const outTint = keyTintScore(r, g, b, sets);
    assert.ok(Math.abs(outTint) <= 2, `output tint ≈ 0, got ${outTint}`);
    assert.ok(Math.abs(a - expectedAlpha) <= 2, `alpha≈${expectedAlpha}, got ${a}`);
    assert.ok(g < 147, `G reduced below blend value 147, got ${g}`);
    assert.ok(r > 100, `R lifted above blend value 100 by coverage division, got ${r}`);
    assert.deepEqual(px(keyed, 8, 3), [SUBJECT.r, SUBJECT.g, SUBJECT.b, 255], "deep subject untouched");
  });

  it("reads blend evidence from SOURCE, not the already-despilled keyed buffer", () => {
    const W = 8, H = 4;
    const source = makeImage(W, H, GREEN);
    const keyed = makeImage(W, H, GREEN);
    for (let y = 0; y < H; y++) {
      setPx(keyed, 0, y, 0, 0, 0, 0);
      const blend = { r: 100, g: 147, b: 20 }; // subject+green blend
      setPx(source, 1, y, blend.r, blend.g, blend.b);
      // Simulate applyColorKey having despilled G in the keyed buffer already.
      setPx(keyed, 1, y, blend.r, 60, blend.b, 180);
      for (let x = 2; x < W; x++) { setPx(source, x, y, 120, 30, 25); setPx(keyed, x, y, 120, 30, 25, 255); }
    }
    const fromSource = clone(keyed);
    applySoftUnmix(fromSource, source, { keyColor: GREEN, ...DEFAULT_SOFT_UNMIX_PARAMS });
    // Reference: unmix computed on a keyed buffer whose band RGB equals source.
    const reference = clone(keyed);
    setPx(reference, 1, 1, source.data[(1 * W + 1) * 4], source.data[(1 * W + 1) * 4 + 1], source.data[(1 * W + 1) * 4 + 2], 180);
    applySoftUnmix(reference, source, { keyColor: GREEN, ...DEFAULT_SOFT_UNMIX_PARAMS });
    assert.deepEqual(px(fromSource, 1, 1), px(reference, 1, 1), "band result independent of keyed RGB mutation");
  });

  it("leaves key-tinted pixels beyond reach untouched (material preservation)", () => {
    const W = 16, H = 16;
    const source = makeImage(W, H, { r: 120, g: 30, b: 25 });
    const keyed = clone(source);
    setPx(keyed, 0, 0, 0, 0, 0, 0); // single hard-keyed seed at corner
    setPx(source, 0, 0, 0, 255, 0);
    // Green-tinted material at Chebyshev distance 6 (> reach 4) from (0,0).
    setPx(source, 6, 6, 90, 200, 60); setPx(keyed, 6, 6, 90, 200, 60, 255);
    // Surround it with more tinted pixels so the cluster exceeds... keep it small but far.
    const before = px(keyed, 6, 6);
    applySoftUnmix(keyed, source, { keyColor: GREEN, reach: 4, spillMaxFraction: 0 });
    assert.deepEqual(px(keyed, 6, 6), before, "beyond-reach pixel byte-identical (spill pass disabled)");
  });

  it("despills a small diagonal-connected trapped cluster, preserving alpha bytes", () => {
    const W = 24, H = 24;
    const source = makeImage(W, H, { r: 140, g: 35, b: 30 });
    const keyed = clone(source);
    setPx(keyed, 0, 0, 0, 0, 0, 0); setPx(source, 0, 0, 0, 255, 0); // distant seed
    // Diagonal chain deep inside the subject (distance > reach): connected only via 8-conn.
    const chain: Array<[number, number]> = [[12, 12], [13, 13], [14, 14]];
    for (const [x, y] of chain) { setPx(source, x, y, 60, 190, 50); setPx(keyed, x, y, 60, 190, 50, 213); }
    applySoftUnmix(keyed, source, { keyColor: GREEN, reach: 4, spillMaxFraction: 0.05 });
    for (const [x, y] of chain) {
      const [r, g, b, a] = px(keyed, x, y);
      assert.equal(a, 213, "alpha byte preserved exactly");
      assert.ok(g < 190, `G despilled from 190, got ${g}`);
      assert.ok(r >= 60, "subject channels not crushed");
      void r; void b;
    }
  });

  it("keeps large key-tinted regions untouched (intentional material)", () => {
    const W = 32, H = 32;
    const source = makeImage(W, H, { r: 140, g: 35, b: 30 });
    const keyed = clone(source);
    setPx(keyed, 0, 0, 0, 0, 0, 0); setPx(source, 0, 0, 0, 255, 0);
    // 12x12 green block deep inside (=144 px, spillLimit at 0.005*~1023 => max(32,5)=32 < 144).
    for (let y = 14; y < 26; y++) for (let x = 14; x < 26; x++) { setPx(source, x, y, 60, 190, 50); setPx(keyed, x, y, 60, 190, 50, 255); }
    const before = px(keyed, 20, 20);
    applySoftUnmix(keyed, source, { keyColor: GREEN, ...DEFAULT_SOFT_UNMIX_PARAMS });
    assert.deepEqual(px(keyed, 20, 20), before, "large cluster byte-identical");
  });

  it("is a byte-level no-op for achromatic keys", () => {
    const source = makeImage(8, 8, { r: 250, g: 250, b: 250 });
    const keyed = clone(source);
    setPx(keyed, 0, 0, 0, 0, 0, 0);
    const before = [...keyed.data];
    applySoftUnmix(keyed, source, { keyColor: { r: 255, g: 255, b: 255 }, ...DEFAULT_SOFT_UNMIX_PARAMS });
    assert.deepEqual([...keyed.data], before);
  });

  it("throws on empty or mismatched buffers", () => {
    const a = makeImage(4, 4);
    const b = makeImage(5, 4);
    assert.throws(() => applySoftUnmix(a, b, { keyColor: GREEN, ...DEFAULT_SOFT_UNMIX_PARAMS }));
    assert.throws(() => applySoftUnmix(
      { width: 0, height: 0, data: new Uint8ClampedArray(0) },
      { width: 0, height: 0, data: new Uint8ClampedArray(0) },
      { keyColor: GREEN, ...DEFAULT_SOFT_UNMIX_PARAMS },
    ));
  });
});
