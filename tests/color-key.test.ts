import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyColorKey,
  sampleKeyColor,
  DEFAULT_COLOR_KEY_PARAMS,
  type PixelBuffer,
} from "../ui/src/lib/canvas/colorKey.ts";

const GREEN = { r: 10, g: 248, b: 15 };
const RED = { r: 220, g: 40, b: 35 };
const WHITE = { r: 255, g: 255, b: 255 };

function makeImage(width: number, height: number, bg = GREEN): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg.r; data[i + 1] = bg.g; data[i + 2] = bg.b; data[i + 3] = 255;
  }
  return { width, height, data };
}

function paintRect(img: PixelBuffer, x0: number, y0: number, w: number, h: number, c: { r: number; g: number; b: number }) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * img.width + x) * 4;
    img.data[i] = c.r; img.data[i + 1] = c.g; img.data[i + 2] = c.b;
  }
}

function alphaAt(img: PixelBuffer, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3];
}

describe("sampleKeyColor", () => {
  it("returns the corner median (background color)", () => {
    const img = makeImage(32, 32);
    paintRect(img, 12, 12, 8, 8, RED); // subject in the middle
    const key = sampleKeyColor(img);
    assert.equal(key.g, GREEN.g);
    assert.equal(key.r, GREEN.r);
  });
  it("throws on malformed buffers", () => {
    assert.throws(() => sampleKeyColor({ width: 0, height: 0, data: new Uint8ClampedArray(0) }));
  });
});

describe("applyColorKey", () => {
  const params = { keyColor: GREEN, ...DEFAULT_COLOR_KEY_PARAMS };

  it("keys the background to alpha 0 and keeps the subject opaque", () => {
    const img = makeImage(32, 32);
    paintRect(img, 12, 12, 8, 8, RED);
    const out = applyColorKey(img, params);
    assert.equal(alphaAt(out, 2, 2), 0, "background corner must be fully keyed");
    assert.equal(alphaAt(out, 16, 16), 255, "subject center must stay opaque");
  });

  it("produces partial alpha in the feather band", () => {
    const img = makeImage(8, 8);
    // A color slightly off the key: inside tolerance+softness band.
    paintRect(img, 0, 0, 8, 8, { r: 80, g: 220, b: 80 });
    const out = applyColorKey(img, { keyColor: GREEN, tolerance: 20, softness: 40, spill: 50 });
    const a = alphaAt(out, 4, 4);
    assert.ok(a > 0 && a < 255, `expected partial alpha, got ${a}`);
  });

  it("suppresses green spill via avg-limiter despill (G reduced toward avg(R,B))", () => {
    const img = makeImage(8, 8);
    paintRect(img, 0, 0, 8, 8, { r: 80, g: 220, b: 80 });
    const out = applyColorKey(img, { keyColor: GREEN, tolerance: 20, softness: 40, spill: 100 });
    const i = (4 * 8 + 4) * 4;
    // Avg-limiter despill: G should be meaningfully reduced (not necessarily
    // clamped to max(R,B), but substantially closer to avg(R,B)).
    assert.ok(out.data[i + 1] < 220, `G must be reduced from 220, got ${out.data[i + 1]}`);
  });

  it("does not mutate the source buffer", () => {
    const img = makeImage(8, 8);
    const before = [...img.data.slice(0, 8)];
    applyColorKey(img, params);
    assert.deepEqual([...img.data.slice(0, 8)], before);
  });

  it("throws on empty/malformed input (failure activation)", () => {
    assert.throws(() => applyColorKey({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, params));
    assert.throws(() => applyColorKey({ width: 4, height: 4, data: new Uint8ClampedArray(7) }, params));
  });

  it("keys a real chroma render end-to-end shape (white preset too)", () => {
    const img = makeImage(16, 16, { r: 250, g: 250, b: 250 });
    paintRect(img, 6, 6, 4, 4, { r: 30, g: 60, b: 200 });
    const key = sampleKeyColor(img);
    const out = applyColorKey(img, { keyColor: key, ...DEFAULT_COLOR_KEY_PARAMS });
    assert.equal(alphaAt(out, 1, 1), 0);
    assert.equal(alphaAt(out, 8, 8), 255);
  });

  it("despills opaque foreground pixels with green cast (hardening 030)", () => {
    // Simulate a foreground pixel that is fully opaque but has green spill
    // from the chroma-green background (e.g. white hair with green rim).
    const img = makeImage(16, 16);
    // Paint a large foreground block — far enough from green to stay opaque,
    // but with a noticeable green cast (g > avg(r,b)).
    paintRect(img, 4, 4, 8, 8, { r: 180, g: 230, b: 170 });
    const out = applyColorKey(img, { keyColor: GREEN, tolerance: 40, softness: 10, spill: 80 });
    const i = (8 * 16 + 8) * 4;
    assert.equal(out.data[i + 3], 255, "foreground must stay fully opaque");
    assert.ok(out.data[i + 1] < 230, `G must be reduced from 230, got ${out.data[i + 1]}`);
  });

  it("preserves legitimate greens far from the key color (hardening 030)", () => {
    // Low-saturation teal — far from chroma green in CbCr space.
    const img = makeImage(16, 16);
    const teal = { r: 80, g: 130, b: 120 };
    paintRect(img, 0, 0, 16, 16, teal);
    const out = applyColorKey(img, { keyColor: GREEN, tolerance: 40, softness: 10, spill: 80 });
    const i = (8 * 16 + 8) * 4;
    // Teal should be mostly preserved — at most minor correction.
    assert.ok(out.data[i + 1] >= 120, `teal G should stay ≥120, got ${out.data[i + 1]}`);
    assert.equal(out.data[i + 3], 255, "teal must stay fully opaque");
  });

  describe("achromatic keys (hardening 031)", () => {
    it("keeps bright-but-colored skin opaque on a white key (chroma cap)", () => {
      const skin = { r: 250, g: 224, b: 210 }; // bright, warm — must NOT key
      const img = makeImage(32, 32, WHITE);
      paintRect(img, 8, 8, 16, 16, skin);
      const out = applyColorKey(img, { keyColor: WHITE, ...DEFAULT_COLOR_KEY_PARAMS });
      assert.equal(alphaAt(out, 2, 2), 0, "white background must be keyed");
      assert.equal(alphaAt(out, 16, 16), 255, "skin must stay fully opaque");
    });

    it("preserves white highlights enclosed by the subject (border contiguity)", () => {
      const img = makeImage(32, 32, WHITE);
      paintRect(img, 6, 6, 20, 20, { r: 40, g: 40, b: 45 }); // dark subject
      paintRect(img, 14, 14, 4, 4, WHITE); // white glint INSIDE the subject
      const out = applyColorKey(img, { keyColor: WHITE, ...DEFAULT_COLOR_KEY_PARAMS });
      assert.equal(alphaAt(out, 2, 2), 0, "outer background must be keyed");
      assert.equal(alphaAt(out, 15, 15), 255, "enclosed highlight must stay opaque");
    });

    it("keys a black background without eating a dark colored subject", () => {
      const black = { r: 5, g: 5, b: 8 };
      const img = makeImage(32, 32, black);
      paintRect(img, 8, 8, 16, 16, { r: 90, g: 45, b: 35 }); // dark warm subject
      const out = applyColorKey(img, { keyColor: black, ...DEFAULT_COLOR_KEY_PARAMS });
      assert.equal(alphaAt(out, 2, 2), 0, "black background must be keyed");
      assert.equal(alphaAt(out, 16, 16), 255, "dark subject must stay opaque");
    });
  });
});
