import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eraseSeedRegions,
  wandByteTolerance,
} from "../ui/src/lib/canvas/wandErase.ts";
import type { PixelBuffer } from "../ui/src/lib/canvas/colorKey.ts";

const WHITE = { r: 255, g: 255, b: 255 };
const RED = { r: 220, g: 40, b: 35 };

function makeImage(width: number, height: number, bg = WHITE): PixelBuffer {
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

function clone(img: PixelBuffer): PixelBuffer {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

describe("wandByteTolerance", () => {
  it("maps the 0-100 strength onto a clamped byte range", () => {
    assert.equal(wandByteTolerance(0), 0);
    assert.equal(wandByteTolerance(40), 28);
    assert.equal(wandByteTolerance(100), 70);
    assert.equal(wandByteTolerance(-5), 0);
    assert.equal(wandByteTolerance(500), 70);
  });
});

describe("eraseSeedRegions", () => {
  it("erases only the clicked contiguous region", () => {
    // Left white region and right white region separated by a red wall.
    const source = makeImage(32, 32);
    paintRect(source, 15, 0, 2, 32, RED); // vertical wall
    const target = clone(source);
    eraseSeedRegions(target, source, [{ x: 0.1, y: 0.5 }], 40);
    assert.equal(alphaAt(target, 4, 16), 0, "clicked left region must be erased");
    assert.equal(alphaAt(target, 28, 16), 255, "right region behind the wall must survive");
    assert.equal(alphaAt(target, 15, 16), 255, "the wall itself must survive");
  });

  it("accumulates multiple seed clicks", () => {
    const source = makeImage(32, 32);
    paintRect(source, 15, 0, 2, 32, RED);
    const target = clone(source);
    eraseSeedRegions(target, source, [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }], 40);
    assert.equal(alphaAt(target, 4, 16), 0);
    assert.equal(alphaAt(target, 28, 16), 0);
    assert.equal(alphaAt(target, 15, 16), 255, "non-matching wall stays");
  });

  it("matches against the SOURCE pixels, not the already-keyed target", () => {
    const source = makeImage(16, 16);
    const target = clone(source);
    // Simulate a prior key pass that already changed target colors.
    for (let i = 0; i < target.data.length; i += 4) { target.data[i] = 0; target.data[i + 1] = 0; }
    eraseSeedRegions(target, source, [{ x: 0.5, y: 0.5 }], 40);
    assert.equal(alphaAt(target, 8, 8), 0, "seed region resolved from source colors");
  });

  it("is a no-op without seeds and validates buffer sizes", () => {
    const source = makeImage(8, 8);
    const target = clone(source);
    eraseSeedRegions(target, source, [], 40);
    assert.equal(alphaAt(target, 4, 4), 255);
    const small = makeImage(4, 4);
    assert.throws(() => eraseSeedRegions(small, source, [{ x: 0.5, y: 0.5 }], 40));
  });
});
