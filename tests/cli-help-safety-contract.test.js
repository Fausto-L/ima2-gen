import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function runCLI(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "bin/ima2.ts", ...args], {
      env: { ...process.env, NO_COLOR: "1", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function snapshot(dir) {
  const names = await readdir(dir);
  return Promise.all(names.sort().map(async (name) => {
    const info = await stat(join(dir, name));
    return [name, info.mtimeMs, info.size];
  }));
}

describe("CLI help safety", () => {
  it("backfill-thumbs --help leaves generated files unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "ima2-help-safety-"));
    const generated = join(root, "generated");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(generated));
    await writeFile(join(generated, "fixture.png"), "not-a-real-image");
    const before = await snapshot(generated);
    const result = await runCLI(["backfill-thumbs", "--help"], {
      IMA2_CONFIG_DIR: root,
      IMA2_GENERATED_DIR: generated,
    });
    const after = await snapshot(generated);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Usage: ima2 backfill-thumbs/);
    assert.doesNotMatch(result.stdout, /Scanning|Done:/);
    assert.deepEqual(after, before);
    await rm(root, { recursive: true, force: true });
  });
});
