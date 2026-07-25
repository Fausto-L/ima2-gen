# File Naming Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreadable `{timestamp}_{randomHex}_{index}.{ext}` filename pattern with a structured `{model}_{aspect}_{date}_{slug}_{index?}.{ext}` format across all image generation pipelines.

**Architecture:** Create a single `lib/filename.ts` module with three pure functions (`buildFilename`, `slugifyPrompt`, `deriveAspect`). All four image pipelines (generate, multimode, agent, edit) call `buildFilename()` instead of constructing filenames inline. Video pipelines, canvas exports, and node store are unchanged.

**Tech Stack:** Node.js ESM, TypeScript (`strict`, `noUnusedLocals`, `NodeNext` modules), `node:test` + `node:assert/strict` for testing, tsx for test execution, tsc for build.

## Global Constraints

- TypeScript strict mode enabled — no implicit `any`, no unused locals/parameters
- Module system: NodeNext — imports must use `.js` extensions for relative paths (even in `.ts` source files)
- `node:crypto` imports use the `node:` prefix in some files (`agentImageVideoGen.ts`) and bare `crypto` in others (`generatePipeline.ts`, `multimodePipeline.ts`, `edit.ts`) — follow each file's existing convention
- Tests run via `npm test` which executes `node scripts/run-tests.mjs` (spawns `node --import tsx --test tests/*.test.*`)
- UI build: `npm run ui:build` (vite + tsc)
- Server build: `npm run build:server` (tsc -p tsconfig.build.json)
- Server start: `nohup node server.js > /tmp/ima2-server.log 2>&1 &`
- `randomBytes` import must NOT be removed from `generatePipeline.ts` (still used at line 509 for `id`), `multimodePipeline.ts` (still used at line 205 for `sequenceId`), or `agentImageVideoGen.ts` (still used at line 329 for video filename) — only `edit.ts` can remove it
- The grok model logic `activeProvider === "grok" ? (quality === "high" ? "grok-imagine-image-quality" : imageModel) : imageModel` is used identically in generatePipeline and multimodePipeline meta objects — the filename must use the same resolved model value as the meta object

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/filename.ts` (new) | Pure functions: `buildFilename()`, `slugifyPrompt()`, `deriveAspect()`. No imports from other project files. |
| `tests/filename.test.ts` (new) | Unit tests for all three functions. |
| `lib/generatePipeline.ts` (modify) | Replace inline filename construction at line 340 with `buildFilename()` call. |
| `lib/multimodePipeline.ts` (modify) | Replace inline filename construction at line 228 with `buildFilename()` call. |
| `lib/agentImageVideoGen.ts` (modify) | Replace inline filename construction at line 176 with `buildFilename()` call. |
| `routes/edit.ts` (modify) | Replace inline filename construction at line 312 with `buildFilename()` call. Remove `randomBytes` import. |

---

### Task 1: Create `lib/filename.ts` with `slugifyPrompt()`

**Files:**
- Create: `lib/filename.ts`
- Test: `tests/filename.test.ts`

**Interfaces:**
- Produces: `slugifyPrompt(prompt: string): string` — takes raw user prompt, returns filesystem-safe slug ≤20 chars

- [ ] **Step 1: Write the failing test**

Create `tests/filename.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slugifyPrompt } from "../lib/filename.ts";

describe("slugifyPrompt", () => {
  it("returns the prompt trimmed and slugified", () => {
    assert.equal(slugifyPrompt("sunset over the mountains"), "sunset-over-the-mount");
  });

  it("truncates to 20 characters", () => {
    assert.equal(slugifyPrompt("a cute cat sitting on a windowsill"), "a-cute-cat-sitting-on");
  });

  it("preserves CJK characters as-is", () => {
    assert.equal(slugifyPrompt("美丽的日落景色"), "美丽的日落景色");
  });

  it("returns 'untitled' for empty string", () => {
    assert.equal(slugifyPrompt(""), "untitled");
  });

  it("returns 'untitled' for whitespace-only string", () => {
    assert.equal(slugifyPrompt("   "), "untitled");
  });

  it("returns 'untitled' for special-chars-only string", () => {
    assert.equal(slugifyPrompt("!!!@@@###"), "untitled");
  });

  it("strips filesystem-unsafe chars", () => {
    assert.equal(slugifyPrompt("hello/world:test?world"), "helloworldtestworld");
  });

  it("collapses consecutive hyphens", () => {
    assert.equal(slugifyPrompt("hello   world"), "hello-world");
  });

  it("trims leading and trailing hyphens", () => {
    assert.equal(slugifyPrompt("  hello  "), "hello");
  });

  it("handles CJK mixed with ASCII", () => {
    assert.equal(slugifyPrompt("美丽的 sunset"), "美丽的-sunset");
  });

  it("truncates CJK at 20 chars", () => {
    const long = "一二三四五六七八九十一二三四五六七八九十";
    assert.equal(slugifyPrompt(long).length <= 20, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/filename.test.ts`
Expected: FAIL with "Cannot find module '../lib/filename.ts'" or similar import error

- [ ] **Step 3: Write minimal implementation**

Create `lib/filename.ts`:

```typescript
/**
 * Slugify a user prompt into a filesystem-safe string ≤20 chars.
 * CJK characters are preserved as-is.
 */
export function slugifyPrompt(prompt: string): string {
  const trimmed = prompt.trim();

  // Strip filesystem-unsafe chars: / \ : * ? " < > |
  const cleaned = trimmed.replace(/[/\\:*?"<>|]/g, "");

  // Replace spaces with hyphens
  const spaced = cleaned.replace(/\s+/g, "-");

  // Collapse consecutive hyphens
  const collapsed = spaced.replace(/-+/g, "-");

  // Trim leading/trailing hyphens
  const hyphenTrimmed = collapsed.replace(/^-+|-+$/g, "");

  // Truncate to 20 chars
  const truncated = hyphenTrimmed.slice(0, 20);

  // Re-trim trailing hyphen that truncation might have left
  const final = truncated.replace(/-+$/g, "");

  return final || "untitled";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/filename.test.ts`
Expected: PASS (all 11 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
git add lib/filename.ts tests/filename.test.ts
git commit -m "feat: add slugifyPrompt() for human-readable filenames"
```

---

### Task 2: Add `deriveAspect()` to `lib/filename.ts`

**Files:**
- Modify: `lib/filename.ts`
- Test: `tests/filename.test.ts`

**Interfaces:**
- Produces: `deriveAspect(size: string): string` — takes size string like `"2368x1728"`, returns GCD-reduced ratio like `"4x3"`. Returns `"1x1"` if unparseable.

- [ ] **Step 1: Write the failing test**

Add to `tests/filename.test.ts` (after the existing `slugifyPrompt` describe block):

```typescript
import { slugifyPrompt, deriveAspect } from "../lib/filename.ts";

describe("deriveAspect", () => {
  it("reduces 2368x1728 to 4x3", () => {
    assert.equal(deriveAspect("2368x1728"), "4x3");
  });

  it("reduces 1024x1024 to 1x1", () => {
    assert.equal(deriveAspect("1024x1024"), "1x1");
  });

  it("reduces 1920x1080 to 16x9", () => {
    assert.equal(deriveAspect("1920x1080"), "16x9");
  });

  it("reduces 1024x1024 with star separator to 1x1", () => {
    assert.equal(deriveAspect("1024*1024"), "1x1");
  });

  it("returns 1x1 for empty string", () => {
    assert.equal(deriveAspect(""), "1x1");
  });

  it("returns 1x1 for unparseable string", () => {
    assert.equal(deriveAspect("auto"), "1x1");
  });

  it("returns 1x1 for 1334x750 (GCD=2 → 667x375)", () => {
    assert.equal(deriveAspect("1334x750"), "667x375");
  });
});
```

Also update the import at the top of the file to include `deriveAspect`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/filename.test.ts`
Expected: FAIL with "deriveAspect is not a function" or "Cannot find export"

- [ ] **Step 3: Write minimal implementation**

Add to `lib/filename.ts` (after `slugifyPrompt`):

```typescript
/**
 * Derive an aspect ratio label from a size string.
 * "2368x1728" → "4x3", "1024x1024" → "1x1".
 * Supports both "x" and "*" separators.
 * Returns "1x1" if the size string can't be parsed.
 */
export function deriveAspect(size: string): string {
  const match = /^(\d+)[x*](\d+)$/i.exec(size.trim());
  if (!match) return "1x1";
  const w = parseInt(match[1], 10);
  const h = parseInt(match[2], 10);
  if (!w || !h) return "1x1";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  return `${w / d}x${h / d}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/filename.test.ts`
Expected: PASS (all 18 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
git add lib/filename.ts tests/filename.test.ts
git commit -m "feat: add deriveAspect() for aspect ratio in filenames"
```

---

### Task 3: Add `buildFilename()` to `lib/filename.ts`

**Files:**
- Modify: `lib/filename.ts`
- Test: `tests/filename.test.ts`

**Interfaces:**
- Produces: `buildFilename(opts: { model: string; size: string; createdAt: number; prompt: string; ext: string; index?: number }): string`

- [ ] **Step 1: Write the failing test**

Add to `tests/filename.test.ts` (after existing describe blocks). Update the import line to include `buildFilename`:

```typescript
import { slugifyPrompt, deriveAspect, buildFilename } from "../lib/filename.ts";

describe("buildFilename", () => {
  it("builds a complete filename with index", () => {
    const result = buildFilename({
      model: "wan2.7-image-pro",
      size: "2368x1728",
      createdAt: new Date("2026-06-17T12:00:00Z").getTime(),
      prompt: "sunset over the mountains",
      ext: "png",
      index: 0,
    });
    assert.equal(result, "wan2.7-image-pro_4x3_20260617_sunset-over-the-mount_0.png");
  });

  it("builds a filename without index when omitted", () => {
    const result = buildFilename({
      model: "grok-imagine-image",
      size: "1920x1080",
      createdAt: new Date("2026-06-17T12:00:00Z").getTime(),
      prompt: "neon cityscape",
      ext: "png",
    });
    assert.equal(result, "grok-imagine-image_16x9_20260617_neon-cityscape.png");
  });

  it("handles empty size string (falls back to 1x1)", () => {
    const result = buildFilename({
      model: "agent-model",
      size: "",
      createdAt: new Date("2026-06-17T12:00:00Z").getTime(),
      prompt: "test prompt",
      ext: "png",
    });
    assert.equal(result, "agent-model_1x1_20260617_test-prompt.png");
  });

  it("handles empty prompt (falls back to untitled)", () => {
    const result = buildFilename({
      model: "qwen-image-max",
      size: "1024x1024",
      createdAt: new Date("2026-06-17T12:00:00Z").getTime(),
      prompt: "",
      ext: "png",
      index: 1,
    });
    assert.equal(result, "qwen-image-max_1x1_20260617_untitled_1.png");
  });

  it("handles CJK prompt", () => {
    const result = buildFilename({
      model: "wan2.7-image-pro",
      size: "2368x1728",
      createdAt: new Date("2026-06-17T12:00:00Z").getTime(),
      prompt: "美丽的日落景色",
      ext: "jpg",
    });
    assert.equal(result, "wan2.7-image-pro_4x3_20260617_美丽的日落景色.jpg");
  });

  it("formats date as YYYYMMDD in UTC", () => {
    const result = buildFilename({
      model: "test",
      size: "1024x1024",
      createdAt: new Date("2026-12-31T23:59:59Z").getTime(),
      prompt: "test",
      ext: "png",
    });
    assert.equal(result, "test_1x1_20261231_test.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/filename.test.ts`
Expected: FAIL with "buildFilename is not a function"

- [ ] **Step 3: Write minimal implementation**

Add to `lib/filename.ts` (after `deriveAspect`):

```typescript
export interface FilenameOptions {
  model: string;
  size: string;
  createdAt: number;
  prompt: string;
  ext: string;
  index?: number;
}

/**
 * Build a structured filename from generation metadata.
 * Format: {model}_{aspect}_{date}_{slug}_{index?}.{ext}
 */
export function buildFilename(opts: FilenameOptions): string {
  const { model, size, createdAt, prompt, ext, index } = opts;
  const aspect = deriveAspect(size);
  const date = new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, "");
  const slug = slugifyPrompt(prompt);
  const indexSuffix = index !== undefined ? `_${index}` : "";
  return `${model}_${aspect}_${date}_${slug}${indexSuffix}.${ext}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/filename.test.ts`
Expected: PASS (all 24 tests)

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npm test`
Expected: PASS — all existing tests still pass, new filename tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
git add lib/filename.ts tests/filename.test.ts
git commit -m "feat: add buildFilename() utility for structured filenames"
```

---

### Task 4: Integrate `buildFilename()` into `generatePipeline.ts`

**Files:**
- Modify: `lib/generatePipeline.ts:339-340`
- Test: verify via build + manual generation

**Interfaces:**
- Consumes: `buildFilename(opts)` from `lib/filename.ts`
- Uses existing variables: `imageModel`, `activeProvider`, `quality`, `effectiveSize`, `prompt`, `resultFormat`, `images.length`

- [ ] **Step 1: Add import**

At the top of `lib/generatePipeline.ts`, add the import. Check existing imports to find the right alphabetical position.

The file imports from `"crypto"` at line 4. Add after the crypto import or with other local imports:

```typescript
import { buildFilename } from "./filename.js";
```

Note: use `.js` extension (NodeNext convention) even though file is `.ts`.

- [ ] **Step 2: Replace the filename construction**

In `lib/generatePipeline.ts`, find this exact code block at lines 339-340:

```typescript
          const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
          const filename = `${Date.now()}_${rand}_${images.length}.${resultFormat}`;
```

Replace with:

```typescript
          const filename = buildFilename({
            model: activeProvider === "grok" ? (quality === "high" ? "grok-imagine-image-quality" : imageModel) : imageModel,
            size: effectiveSize,
            createdAt: Date.now(),
            prompt,
            ext: resultFormat,
            index: images.length,
          });
```

**Important:** The `model` value matches the `meta.model` value at line 361. The grok ternary logic is identical.

**Do NOT remove the `randomBytes` import** — it is still used at line 509 for `id: randomBytes(8).toString("hex")`.

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `npm test`
Expected: PASS — all tests still pass

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `npm run build:server`
Expected: Success with no errors

- [ ] **Step 5: Commit**

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
git add lib/generatePipeline.ts
git commit -m "refactor: use buildFilename() in generatePipeline"
```

---

### Task 5: Integrate `buildFilename()` into `multimodePipeline.ts`

**Files:**
- Modify: `lib/multimodePipeline.ts:227-228`

**Interfaces:**
- Consumes: `buildFilename(opts)` from `lib/filename.ts`
- Uses existing variables: `imageModel`, `activeProvider`, `quality`, `effectiveSize`, `prompt`, `resultFormat`, `index`

- [ ] **Step 1: Add import**

At the top of `lib/multimodePipeline.ts`, add the import alongside other local imports:

```typescript
import { buildFilename } from "./filename.js";
```

- [ ] **Step 2: Replace the filename construction**

In `lib/multimodePipeline.ts`, find this exact code block at lines 227-228:

```typescript
        const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
        const filename = `${Date.now()}_${rand}_multimode_${index}.${resultFormat}`;
```

Replace with:

```typescript
        const filename = buildFilename({
          model: activeProvider === "grok" ? (quality === "high" ? "grok-imagine-image-quality" : imageModel) : imageModel,
          size: effectiveSize,
          createdAt: Date.now(),
          prompt,
          ext: resultFormat,
          index,
        });
```

**Do NOT remove the `randomBytes` import** — it is still used at line 205 for `sequenceId`.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `npm run build:server`
Expected: Success

- [ ] **Step 5: Commit**

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
git add lib/multimodePipeline.ts
git commit -m "refactor: use buildFilename() in multimodePipeline"
```

---

### Task 6: Integrate `buildFilename()` into `agentImageVideoGen.ts`

**Files:**
- Modify: `lib/agentImageVideoGen.ts:175-176`

**Interfaces:**
- Consumes: `buildFilename(opts)` from `lib/filename.ts`
- Uses existing variables: `generation.model`, `prompt`, `format`

- [ ] **Step 1: Add import**

At the top of `lib/agentImageVideoGen.ts`, add the import. The file already imports from `"node:crypto"` at line 1.

```typescript
import { buildFilename } from "./filename.js";
```

- [ ] **Step 2: Replace the filename construction**

In `lib/agentImageVideoGen.ts`, find this exact code block at lines 175-176:

```typescript
  const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
  const filename = `${Date.now()}_${rand}_agent.${format}`;
```

Replace with:

```typescript
  const filename = buildFilename({
    model: generation.model,
    size: "",
    createdAt: Date.now(),
    prompt,
    ext: format,
  });
```

**Do NOT remove the `randomBytes` import** — it is still used at line 329 for video filename generation (`persistAgentVideo` function).

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `npm run build:server`
Expected: Success

- [ ] **Step 5: Commit**

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
git add lib/agentImageVideoGen.ts
git commit -m "refactor: use buildFilename() in agentImageVideoGen"
```

---

### Task 7: Integrate `buildFilename()` into `routes/edit.ts`

**Files:**
- Modify: `routes/edit.ts:312`
- Modify: `routes/edit.ts:4` (remove `randomBytes` import)

**Interfaces:**
- Consumes: `buildFilename(opts)` from `lib/filename.ts`
- Uses existing variables: `imageModel`, `activeProvider`, `effectiveSize`, `prompt`, `editExt`

- [ ] **Step 1: Add import and remove unused import**

At the top of `routes/edit.ts`, add the buildFilename import:

```typescript
import { buildFilename } from "../lib/filename.js";
```

Then remove the `randomBytes` import at line 4 (it is no longer used in this file). Find and remove this exact line:

```typescript
import { randomBytes } from "crypto";
```

**Verify:** Search for any other `randomBytes` usage in `routes/edit.ts` before removing. Run:

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
grep -n "randomBytes" routes/edit.ts
```

Expected: Only the import line at line 4 should appear — no other usages.

- [ ] **Step 2: Replace the filename construction**

In `routes/edit.ts`, find this exact code at line 312:

```typescript
      const filename = `${Date.now()}_${randomBytes(ctx.config.ids.generatedHexBytes).toString("hex")}.${editExt}`;
```

Replace with:

```typescript
      const filename = buildFilename({
        model: imageModel || activeProvider,
        size: effectiveSize || "",
        createdAt: Date.now(),
        prompt: prompt || "",
        ext: editExt,
      });
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `npm run build:server`
Expected: Success — `noUnusedLocals: true` will catch if `randomBytes` import was left in but unused

- [ ] **Step 5: Commit**

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
git add routes/edit.ts
git commit -m "refactor: use buildFilename() in edit route, remove unused randomBytes import"
```

---

### Task 8: Build, restart server, and verify end-to-end

**Files:**
- No file changes — verification only

- [ ] **Step 1: Build both server and UI**

Run:
```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
npm run build:server && npm run ui:build
```
Expected: Both succeed with no errors

- [ ] **Step 2: Stop any running server and restart**

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
# Kill any existing node server.js process
pkill -f "node server.js" 2>/dev/null || true
sleep 1
nohup node server.js > /tmp/ima2-server.log 2>&1 &
sleep 3
curl -s http://127.0.0.1:3333/api/health | head -5
```
Expected: Server responds with health check JSON

- [ ] **Step 3: Generate an image and verify the filename**

Use the browser to navigate to `http://127.0.0.1:3333/#create`, enter a prompt like "美丽的日落景色", select wan2.7-image-pro model, select 16:9 size, and click Generate.

After generation, check the generated filename in the downloads directory:

```bash
ls -t /Users/faustolin/Documents/生图调研/ima2-gen/generated/ | head -5
```

Expected: Filename like `wan2.7-image-pro_16x9_20260617_美丽的日落景色_0.png` (date will vary)

- [ ] **Step 4: Verify the sidecar JSON filename matches**

```bash
ls -t /Users/faustolin/Documents/生图调研/ima2-gen/generated/*.json | head -3
cat /Users/faustolin/Documents/生图调研/ima2-gen/generated/*.json | head -20
```

Expected: The sidecar `.json` file has the same base name as the image file

- [ ] **Step 5: Final commit if any build artifacts changed**

If the build produced updated `.js` files that weren't caught in earlier commits:

```bash
cd /Users/faustolin/Documents/生图调研/ima2-gen
git add -A
git commit -m "build: rebuild server and UI with new filename format"
```
