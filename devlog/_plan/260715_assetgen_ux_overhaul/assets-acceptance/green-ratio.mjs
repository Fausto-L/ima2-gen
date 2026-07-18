// 030 acceptance evidence: SPILL ABLATION (not a historical pre-hardening
// binary — none survives). Same build, same alpha path; only the despill
// stage differs: "before" = spill:0 (despill off), "after" = spill:50
// (hardened default). Per 000_current_status.md §1.3 we therefore do NOT
// claim "historical pre-hardening ratio reduction"; we claim the despill
// stage's measured effect on identical inputs.
// Metric: among alpha>0 pixels, ratio where g > max(r,b)+24 (030:50-56).
// Run: node --import tsx devlog/_plan/260715_assetgen_ux_overhaul/assets-acceptance/green-ratio.mjs
import sharp from "sharp";
import { applyColorKey, sampleKeyColor } from "../../../../ui/src/lib/canvas/colorKey.ts";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const GEN = process.env.IMA2_GENERATED_DIR || `${process.env.HOME}/.ima2/generated`;

const ASSETS = [
  { id: "a_01KXK896XCWG8HVYB1FWD3YW3W", file: "1784131394336_776db756_0.png", role: "a-fine-hair" },
  { id: "a_01KXK895TVZYG7YHHRJD30W75C", file: "1784131393219_6b239780_0.png", role: "b-long-wavy-hair" },
  { id: "gen-accept-green-eye", file: "1784370805713_326926dd_0.png", role: "b-green-eyes-jewel" },
  { id: "a_01KXJ5G8H2TDJJNQ82A90J9ABE", file: "1784094925207_708995f4_0.png", role: "c-control" },
];

async function load(file) {
  const { data, info } = await sharp(path.join(GEN, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

async function save(buf, out) {
  await sharp(Buffer.from(buf.data.buffer, buf.data.byteOffset, buf.data.length), { raw: { width: buf.width, height: buf.height, channels: 4 } }).png().toFile(out);
}

function greenDominantRatio(buf) {
  let fg = 0, dom = 0;
  const d = buf.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0) {
      fg++;
      if (d[i + 1] > Math.max(d[i], d[i + 2]) + 24) dom++;
    }
  }
  return { fg, dom, ratio: fg ? dom / fg : 0 };
}

console.log("assetId,role,keyColor,before%,after%");
for (const a of ASSETS) {
  const src = await load(a.file);
  const keyColor = sampleKeyColor(src);
  const before = applyColorKey(src, { keyColor, tolerance: 40, softness: 10, spill: 0 });
  const after = applyColorKey(src, { keyColor, tolerance: 40, softness: 10, spill: 50 });
  const mb = greenDominantRatio(before), ma = greenDominantRatio(after);
  await save(before, path.join(here, `${a.role}-before.png`));
  await save(after, path.join(here, `${a.role}-after.png`));
  console.log(
    `${a.id},${a.role},rgb(${keyColor.r},${keyColor.g},${keyColor.b}),` +
    `${(mb.ratio * 100).toFixed(2)}% (${mb.dom}/${mb.fg}),${(ma.ratio * 100).toFixed(2)}% (${ma.dom}/${ma.fg})`,
  );
}
