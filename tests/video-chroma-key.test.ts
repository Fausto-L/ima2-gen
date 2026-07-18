import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapClientParamsToFfmpeg, buildKeyingArgs, keyVideoToWebm } from "../lib/videoChromaKey.ts";

describe("mapClientParamsToFfmpeg", () => {
  it("maps the spike-calibrated defaults (tolerance 40 -> similarity 0.10)", () => {
    const p = mapClientParamsToFfmpeg({ tolerance: 40, softness: 10, keyColor: { r: 0x22, g: 0xaa, b: 0x36 } });
    assert.equal(p.similarity, 0.1);
    assert.equal(p.blend, 0.03);
    assert.equal(p.keyColor, "0x22aa36");
  });
  it("clamps out-of-range sliders and defaults key color to pure green", () => {
    const p = mapClientParamsToFfmpeg({ tolerance: 500, softness: -3 });
    assert.equal(p.similarity, 0.22);
    assert.equal(p.blend, 0);
    assert.equal(p.keyColor, "0x00ff00");
  });
});

describe("buildKeyingArgs", () => {
  it("assembles the exact spike-proven ffmpeg argv", () => {
    const args = buildKeyingArgs("/in.mp4", "/out.webm", { keyColor: "0x22aa36", similarity: 0.1, blend: 0.03 });
    assert.ok(args.includes("-i") && args.includes("/in.mp4"));
    assert.ok(args.includes("chromakey=0x22aa36:0.1:0.03,despill=type=green"));
    assert.deepEqual(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 6), ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0"]);
    assert.equal(args.at(-1), "/out.webm");
  });
  it("rejects invalid filter params before ffmpeg is reached (activation)", () => {
    assert.throws(() => buildKeyingArgs("/a", "/b", { keyColor: "green", similarity: 0.1, blend: 0 }), /invalid keyColor/);
    assert.throws(() => buildKeyingArgs("/a", "/b", { keyColor: "0x00ff00", similarity: 5, blend: 0 }), /similarity/);
  });
});

describe("keyVideoToWebm process handling", () => {
  const fakeExec = (behavior: "enoent" | "nonzero" | "ok") =>
    ((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
      if (behavior === "enoent") {
        const err = new Error("spawn ffmpeg ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        setImmediate(() => cb(err, "", ""));
      } else if (behavior === "nonzero") {
        setImmediate(() => cb(new Error("exit 1"), "", "Invalid data found when processing input\nconversion failed"));
      } else {
        setImmediate(() => cb(null, "", ""));
      }
      return { stderr: null, kill: () => {} };
    }) as unknown as typeof import("child_process").execFile;

  it("translates ENOENT into an install diagnostic (activation)", async () => {
    await assert.rejects(
      keyVideoToWebm("/a.mp4", "/b.webm", { keyColor: "0x00ff00", similarity: 0.1, blend: 0 }, undefined, undefined, fakeExec("enoent")),
      /ffmpeg not installed/,
    );
  });
  it("surfaces the stderr tail on nonzero exit (activation)", async () => {
    await assert.rejects(
      keyVideoToWebm("/a.mp4", "/b.webm", { keyColor: "0x00ff00", similarity: 0.1, blend: 0 }, undefined, undefined, fakeExec("nonzero")),
      /conversion failed/,
    );
  });
  it("resolves on clean exit", async () => {
    await keyVideoToWebm("/a.mp4", "/b.webm", { keyColor: "0x00ff00", similarity: 0.1, blend: 0 }, undefined, undefined, fakeExec("ok"));
  });
});
