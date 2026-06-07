import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { readSourceTree } from "./_readTree.mjs";

const root = process.cwd();

function readSource(path) {
  const content = readFileSync(join(root, path), "utf8");
  const dir = dirname(path);
  let combined = content;
  const re = /(?:export|import)\s+[\s\S]*?from\s*["']\.\/([\w.\/-]+)["']/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    for (const ext of ["", ".ts", ".tsx", ".js"]) {
      try { combined += "\n" + readFileSync(join(root, dir, m[1] + ext), "utf8"); break; } catch {}
    }
  }
  const cssRe = /@import\s+["']\.\/([\w.\/-]+)["']/g;
  while ((m = cssRe.exec(content)) !== null) {
    try { combined += "\n" + readFileSync(join(root, dir, m[1]), "utf8"); } catch {}
  }
  return combined;
}

describe("direct mode visual contract", () => {
  it("marks direct mode on the prompt composer without overriding multimode", () => {
    const composer = readSource("ui/src/components/PromptComposer.tsx");

    assert.match(composer, /const isDirectMode = promptMode === "direct"/);
    assert.match(composer, /isDirectMode \? " composer--direct" : ""/);
    assert.match(composer, /multimode \? " composer--multimode" : ""/);
    assert.match(composer, /isDirectMode && multimode \? " composer--combined-modes" : ""/);
    assert.match(composer, /className="composer__direct-badge"/);
    assert.match(composer, /t\("prompt\.directModeActive"\)/);
    assert.match(composer, /aria-pressed=\{isDirectMode\}/);
  });

  it("styles direct mode separately from the multimode composer state", () => {
    const css = readSource("ui/src/index.css");

    assert.match(css, /\.composer--direct\s*\{/);
    assert.match(css, /\.composer__direct-badge\s*\{/);
    assert.match(css, /\.composer--multimode\s*\{/);
    assert.match(css, /\.composer--combined-modes\s*\{/);
    assert.match(css, /\.composer__mode-badge\s*\{/);
    assert.match(css, /\.composer__header-meta\s*\{[\s\S]*?flex-wrap:\s*wrap/);
    assert.match(css, /\.composer__tool--on\s*\{/);
  });

  it("defines short direct mode active copy in both locales", () => {
    const en = readSource("ui/src/i18n/en.json");
    const ko = readSource("ui/src/i18n/ko.json");

    assert.match(en, /"directModeActive":\s*"1:1 Direct on"/);
    assert.match(ko, /"directModeActive":\s*"1:1 Direct 켜짐"/);
  });
});
