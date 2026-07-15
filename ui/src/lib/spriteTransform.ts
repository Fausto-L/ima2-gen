import type { SpriteFrameTransform } from "../types/spriteAtlas";

export function normalizeSpriteTransform(input: Partial<SpriteFrameTransform>): SpriteFrameTransform {
  return {
    rotate: Number.isFinite(input.rotate) ? input.rotate! : 0,
    scale: Number.isFinite(input.scale) && input.scale! > 0 ? input.scale! : 1,
    dx: Number.isFinite(input.dx) ? input.dx! : 0,
    dy: Number.isFinite(input.dy) ? input.dy! : 0,
    shx: Number.isFinite(input.shx) ? input.shx! : 0,
    shy: Number.isFinite(input.shy) ? input.shy! : 0,
    flipX: input.flipX === 1 ? 1 : 0,
  };
}

export function spriteTransformMatrix(input: SpriteFrameTransform) {
  const { rotate, scale: s, shx, shy, flipX } = normalizeSpriteTransform(input);
  const radians = rotate * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let m00 = s * (cos + sin * shy);
  const m01 = s * (cos * shx + sin);
  let m10 = s * (-sin + cos * shy);
  const m11 = s * (cos - sin * shx);
  if (flipX) {
    m00 = -m00;
    m10 = -m10;
  }
  return { m00, m01, m10, m11 };
}

export function toCanvasTransform(
  input: SpriteFrameTransform,
  source: { width: number; height: number },
  cell: { width: number; height: number },
): DOMMatrix {
  const t = normalizeSpriteTransform(input);
  const { m00, m01, m10, m11 } = spriteTransformMatrix(t);
  const sourceX = source.width / 2;
  const sourceY = source.height / 2;
  const outputX = cell.width / 2 + t.dx;
  const outputY = cell.height / 2 + t.dy;
  const values = [
    m00,
    m10,
    m01,
    m11,
    outputX - m00 * sourceX - m01 * sourceY,
    outputY - m10 * sourceX - m11 * sourceY,
  ];
  if (typeof DOMMatrix !== "undefined") return new DOMMatrix(values);
  const [a, b, c, d, e, f] = values;
  return { a, b, c, d, e, f, m11: a, m12: b, m21: c, m22: d, m41: e, m42: f } as unknown as DOMMatrix;
}
