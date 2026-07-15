import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeSpriteTransform, spriteTransformMatrix, toCanvasTransform } from "../ui/src/lib/spriteTransform.ts";

const close = (actual: number, expected: number, epsilon = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

describe("sprite curator transform parity", () => {
  it("normalizes the sprite-gen identity", () => {
    assert.deepEqual(normalizeSpriteTransform({}), {
      rotate: 0, scale: 1, dx: 0, dy: 0, shx: 0, shy: 0, flipX: 0,
    });
    assert.deepEqual(spriteTransformMatrix(normalizeSpriteTransform({})), {
      m00: 1, m01: 0, m10: 0, m11: 1,
    });
  });

  it("keeps positive rotation counter-clockwise in y-down canvas coordinates", () => {
    const matrix = spriteTransformMatrix(normalizeSpriteTransform({ rotate: 90 }));
    close(matrix.m00, 0);
    close(matrix.m01, 1);
    close(matrix.m10, -1);
    close(matrix.m11, 0);
    const point = { x: matrix.m00, y: matrix.m10 };
    close(point.x, 0);
    close(point.y, -1);
  });

  it("matches Rotate · Shear · Scale · FlipX for a combined golden transform", () => {
    const transform = normalizeSpriteTransform({ rotate: 30, scale: 1.5, shx: .2, shy: -.1, flipX: 1 });
    const matrix = spriteTransformMatrix(transform);
    const cos = Math.cos(Math.PI / 6);
    const sin = Math.sin(Math.PI / 6);
    close(matrix.m00, -1.5 * (cos + sin * -.1));
    close(matrix.m01, 1.5 * (cos * .2 + sin));
    close(matrix.m10, -1.5 * (-sin + cos * -.1));
    close(matrix.m11, 1.5 * (cos - sin * .2));
  });

  it("maps the source center to cell center plus translation", () => {
    const transform = normalizeSpriteTransform({ rotate: 23, scale: 1.4, shx: .15, shy: -.08, dx: 7, dy: -4 });
    const matrix = toCanvasTransform(transform, { width: 48, height: 32 }, { width: 96, height: 80 });
    close(matrix.a * 24 + matrix.c * 16 + matrix.e, 55);
    close(matrix.b * 24 + matrix.d * 16 + matrix.f, 36);
  });
});
