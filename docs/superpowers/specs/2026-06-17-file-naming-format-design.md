# File Naming Format Design

## Problem

Generated image filenames currently use the pattern `{timestamp}_{randomHex}_{index}.{ext}` (e.g. `1758000000000_a3b4c5d6_0.png`). This is unreadable: the timestamp is a raw Unix epoch, there's no model or aspect ratio information, and no hint of the image content.

## Solution

Replace the naming pattern across all image generation pipelines with a structured, human-readable format:

```
{model}_{aspect}_{date}_{slug}_{index?}.{ext}
```

### Components

| Component | Source | Example | Transformation |
|-----------|--------|---------|----------------|
| `model` | `meta.model` (e.g. `wan2.7-image-pro`) | `wan2.7-image-pro` | Used as-is |
| `aspect` | `meta.size` (e.g. `"2368x1728"`) | `4x3` | GCD-reduced ratio from width×height |
| `date` | `meta.createdAt` (Unix ms) | `20260617` | `YYYYMMDD` format |
| `slug` | `meta.prompt` / `meta.userPrompt` | `美丽的日落景色` | Slugified, ≤20 chars |
| `index` | Pipeline-specific, only for multi-image | `_0` | Omitted for single images |
| `ext` | Pipeline result format | `png` | As-is |

### Example filenames

```
wan2.7-image-pro_16x9_20260617_sunset-over-mountains_0.png
qwen-image-max_1x1_20260617_cute-cat-portrait_1.png
grok-imagine-image_4x3_20260617_neon-cityscape.png
```

## Slug generation (`slugifyPrompt()`)

Takes the raw user prompt and produces a filesystem-safe slug of ≤20 characters.

### Rules

1. **Trim** leading/trailing whitespace from the prompt
2. **Slice** to first 20 characters
3. **Preserve CJK characters** (Chinese/Japanese/Korean) as-is — UTF-8 filenames are valid on all modern OSes
4. **Replace spaces** with hyphens (`-`)
5. **Strip filesystem-unsafe chars**: `/ \ : * ? " < > |` removed entirely
6. **Collapse** consecutive hyphens into one
7. **Trim** leading/trailing hyphens (from step 4/5 edge cases)
8. **Fallback**: If empty after all transformations → `untitled`

### Examples

| Input | Output |
|-------|--------|
| `"美丽的日落景色"` | `美丽的日落景色` |
| `"a cute cat sitting on a windowsill"` | `a-cute-cat-sitting-on` |
| `"sunset over the mountains"` | `sunset-over-the-mount` |
| `""` | `untitled` |
| `"!!!@@@###"` | `untitled` |

## Aspect ratio derivation (`deriveAspect()`)

Takes a size string like `"2368x1728"` or `"1024*1024"` and reduces it to simplest integer ratio form.

### Algorithm

1. Parse width and height from the size string (support both `x` and `*` separators)
2. Compute GCD (greatest common divisor) of width and height
3. Divide both by GCD → `(w/gcd, h/gcd)`
4. Return `"{w}x{h}"`

### Examples

| Input | GCD | Output |
|-------|-----|--------|
| `"2368x1728"` | 592 | `4x3` |
| `"1024x1024"` | 1024 | `1x1` |
| `"1920x1080"` | 120 | `16x9` |
| `"1334x750"` | 2 | `667x375` |

Edge case: If size string can't be parsed, fall back to `1x1`.

## `buildFilename()` utility

Single entry point for all image pipelines. Pure function, no side effects.

### Signature

```typescript
interface FilenameOptions {
  model: string;
  size: string;       // e.g. "2368x1728"
  createdAt: number;  // Unix timestamp in ms
  prompt: string;     // raw user prompt
  ext: string;        // extension without dot (e.g. "png")
  index?: number;     // only for multi-image generation
}

function buildFilename(opts: FilenameOptions): string
```

### Output construction

```
{model}_{deriveAspect(size)}_{formatDate(createdAt)}_{slugifyPrompt(prompt)}{index !== undefined ? `_${index}` : ''}.{ext}
```

## Files to modify

### New file: `lib/filename.ts`

Exports `buildFilename()`, `slugifyPrompt()`, and `deriveAspect()`. All pure functions.

### `lib/generatePipeline.ts` (line 340)

**Before:**
```typescript
const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
const filename = `${Date.now()}_${rand}_${images.length}.${resultFormat}`;
```

**After:**
```typescript
const filename = buildFilename({
  model: imageModel,
  size: effectiveSize,
  createdAt: Date.now(),
  prompt,
  ext: resultFormat,
  index: images.length,
});
```

The `randomBytes` import and `rand` variable are removed if no longer used elsewhere in that scope.

### `lib/multimodePipeline.ts` (line 228)

**Before:**
```typescript
const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
const filename = `${Date.now()}_${rand}_multimode_${index}.${resultFormat}`;
```

**After:**
```typescript
const filename = buildFilename({
  model: imageModel,
  size: effectiveSize,
  createdAt: Date.now(),
  prompt,  // 'prompt' is the variable name in multimodePipeline.ts
  ext: resultFormat,
  index,
});
```

### `lib/agentImageVideoGen.ts` (line 176)

**Before:**
```typescript
const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
const filename = `${Date.now()}_${rand}_agent.${format}`;
```

**After:**
```typescript
const filename = buildFilename({
  model: generation.model,
  size: "",  // agent pipeline may not have size; deriveAspect falls back to 1x1
  createdAt: Date.now(),
  prompt,
  ext: format,
});
```

### `routes/edit.ts` (line 312)

**Before:**
```typescript
const filename = `${Date.now()}_${randomBytes(ctx.config.ids.generatedHexBytes).toString("hex")}.${editExt}`;
```

**After:**
```typescript
const filename = buildFilename({
  model: imageModel || activeProvider,
  size: effectiveSize || "",
  createdAt: Date.now(),
  prompt: prompt || "",
  ext: editExt,
});
```

## Out of scope

- **Video pipelines** (`routes/video.ts`, `routes/videoExtended.ts`, agent video) keep their existing `_${rand}.mp4` naming — videos don't have prompt/aspect in the same way
- **Canvas exports** (`ui/src/lib/canvas/exportRenderer.ts`) keep `canvas-export-YYYYMMDDHHMMSS` naming — different convention, different use case
- **Frontend download logic** (`ResultActions.tsx`) — no changes needed, already uses `actionImage.filename`
- **Rename/edit-after capability** — can be added as a future enhancement; the metadata panel already displays all generation info
- **Node store** (`lib/nodeStore.ts`) — uses `{nodeId}.{ext}` and is left unchanged
- **Local import store** (`lib/localImportStore.ts`) — uses `makeImportedFilename()` and is left unchanged

## Testing

The `lib/filename.ts` module exports pure functions that can be tested in isolation:

- `slugifyPrompt()`: test edge cases (empty, CJK, special chars, length limit, word boundary truncation)
- `deriveAspect()`: test common sizes, GCD reduction, unparseable input
- `buildFilename()`: test full pipeline with various inputs, verify format

## Backward compatibility

- Existing files on disk are not renamed — only new generations use the new format
- All backend code that reads filenames by pattern (history, annotations, etc.) uses decoded URL params and filesystem lookups, not pattern matching on the filename itself, so old and new filenames coexist
- The existing `isSafeFilename()` validation in `routes/annotations.ts` already accepts underscores, hyphens, CJK, and alphanumerics — the new format passes validation
