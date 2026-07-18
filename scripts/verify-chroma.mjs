#!/usr/bin/env node
/**
 * Chroma uniformity / alpha verifier (devlog 260715_asset_gen_mode/032).
 *
 * Usage:
 *   node scripts/verify-chroma.mjs <file.png|file.mp4>        # green-dominance gate
 *   node scripts/verify-chroma.mjs <file.webm> --alpha        # decoded-alpha gate
 *
 * mp4: extracts first/middle/last frames via ffmpeg, samples 8 border points
 *      per frame; PASS = >=95% green-dominant AND inter-frame dRGB <= 15.
 * webm (--alpha): decodes with libvpx-vp9 (VP9 alpha is side-data — ffprobe
 *      pix_fmt lies), PASS = border alpha 0 and some opaque interior pixels.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const pExecFile = promisify(execFile);
const file = process.argv[2];
const alphaMode = process.argv.includes("--alpha");
if (!file) {
  console.error("usage: verify-chroma <file.png|mp4|webm> [--alpha]");
  process.exit(2);
}

function borderPoints(w, h) {
  return [[8, 8], [w - 9, 8], [8, h - 9], [w - 9, h - 9], [Math.floor(w / 2), 8], [Math.floor(w / 2), h - 9], [8, Math.floor(h / 2)], [w - 9, Math.floor(h / 2)]];
}

async function samplePng(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pts = borderPoints(info.width, info.height);
  const border = pts.map(([x, y]) => {
    const i = (y * info.width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  });
  const center = (() => {
    const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  })();
  return { border, center, info };
}

async function extractFrames(src, dir, decodeVp9) {
  const args = ["-y", "-loglevel", "error"];
  if (decodeVp9) args.push("-c:v", "libvpx-vp9");
  args.push("-i", src, "-vf", "select='eq(n,0)+eq(n,60)+eq(n,119)'", "-vsync", "vfr", join(dir, "f_%d.png"));
  await pExecFile("ffmpeg", args);
  return [1, 2, 3].map((n) => join(dir, `f_${n}.png`));
}

const dir = await mkdtemp(join(tmpdir(), "verify-chroma-"));
let failed = false;
try {
  if (alphaMode) {
    const frames = await extractFrames(file, dir, true);
    for (const frame of frames) {
      const { border, center } = await samplePng(frame);
      const transparent = border.filter(([, , , a]) => a === 0).length;
      const ok = transparent >= 8 && center[3] === 255;
      console.log(`${frame.split("/").pop()}: border-alpha0 ${transparent}/8, center-alpha ${center[3]} ${ok ? "OK" : "FAIL"}`);
      if (!ok) failed = true;
    }
  } else {
    const frames = file.toLowerCase().endsWith(".png") ? [file] : await extractFrames(file, dir, false);
    let prevAvg = null;
    for (const frame of frames) {
      const { border } = await samplePng(frame);
      const dominant = border.filter(([r, g, b]) => g > r + 40 && g > b + 40).length;
      const avg = border.reduce((acc, [r, g, b]) => [acc[0] + r / border.length, acc[1] + g / border.length, acc[2] + b / border.length], [0, 0, 0]).map(Math.round);
      let drift = 0;
      if (prevAvg) drift = Math.max(...avg.map((v, i) => Math.abs(v - prevAvg[i])));
      prevAvg = avg;
      const ok = dominant / border.length >= 0.95 && drift <= 15;
      console.log(`${frame.split("/").pop()}: green-dominant ${dominant}/8, avg [${avg}], drift ${drift} ${ok ? "OK" : "FAIL"}`);
      if (!ok) failed = true;
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
console.log(failed ? "VERDICT: FAIL" : "VERDICT: PASS");
process.exit(failed ? 1 : 0);
