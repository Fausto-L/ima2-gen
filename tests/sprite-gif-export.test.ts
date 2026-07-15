import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { buildTransparentGifArgs, exportTransparentGif } from "../lib/spriteGifExport.ts";

test("GIF args request a transparent palette", () => { const args = buildTransparentGifArgs({ framePattern: "frame-%d.png", outputPath: "out.gif", fps: 8, loop: true }); assert.match(args.join(" "), /reserve_transparent=1/); assert.equal(args.at(-1), "out.gif"); });
test("missing ffmpeg surfaces a 503 code and no success", async () => { const fake = ((_file: string, _args: readonly string[], _options: unknown, callback: (error: NodeJS.ErrnoException, stdout: string, stderr: string) => void) => { const child = new EventEmitter() as EventEmitter & { kill(): boolean }; child.kill = () => true; queueMicrotask(() => callback(Object.assign(new Error("missing"), { code: "ENOENT" }), "", "")); return child; }) as never; await assert.rejects(exportTransparentGif({ framePattern: "frame-%d.png", outputPath: "/tmp/ima2-never.gif", fps: 8, loop: true }, { execFileImpl: fake }), (error: any) => error.code === "FFMPEG_UNAVAILABLE" && error.status === 503); });
