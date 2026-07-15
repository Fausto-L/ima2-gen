import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseSpriteGenManifest, serializeSpriteGenManifest, validateFrameLayout } from "../lib/spriteAtlasManifest.ts";

const fixture = JSON.parse(await readFile(new URL("./fixtures/sprite-gen/manifest.json", import.meta.url), "utf8"));
test("sprite-gen manifest preserves all known and unknown fields", () => { const parsed = parseSpriteGenManifest(fixture); assert.deepEqual(parseSpriteGenManifest(JSON.parse(serializeSpriteGenManifest(parsed))), parsed); assert.deepEqual(parsed.future_top_level, { preserved: true }); assert.equal(parsed.animation.rows.idle.future_row, "kept"); });
test("frame layout reports geometry and frame count errors", () => { const manifest = parseSpriteGenManifest(structuredClone(fixture)); manifest.frame_layout.rows.idle[0].w = 0; manifest.frame_layout.rows.idle[1].x = 30; manifest.animation.rows.idle.frames = 3; const errors = validateFrameLayout(manifest, { width: 32, height: 16 }); assert.equal(errors.length, 3); });
test("future frame variants remain open strings", () => { assert.equal(parseSpriteGenManifest({ ...fixture, frame_variant: "future-hd" }).frame_variant, "future-hd"); });
