# 010 — Phase 1: Element image display + @ badge

## MODIFY map

### MODIFY `ui/src/components/assets/AssetsGrid.tsx`

Add a helper to extract element thumbnail path from `metadata.refs[0]`
when `filePath` is null. Use it in `AssetTile`.

Before (line ~38):
```tsx
const url = item.filePath ? mediaUrl(item.filePath) : null;
```

After:
```tsx
function elementThumbPath(item: AssetItem): string | null {
  if (item.filePath) return item.filePath;
  const refs = item.metadata?.refs;
  if (Array.isArray(refs)) {
    const first = refs.find((r): r is string => typeof r === "string" && r.length > 0);
    if (first) return first;
  }
  return null;
}
// in AssetTile:
const filePath = item.kind === "element" ? elementThumbPath(item) : item.filePath;
const url = filePath ? mediaUrl(filePath) : null;
```

### MODIFY `ui/src/components/assets/ElementDetail.tsx`

In `toDraft` (line ~39), prefix `previewUrl` with `/generated/` path.

Before:
```tsx
previewUrl: path,
```

After:
```tsx
previewUrl: `/generated/${path.split("/").map(encodeURIComponent).join("/")}`,
```

### MODIFY `ui/src/components/assets/AssetElementToggle.tsx`

Show `@` badge on element-kind items as a read-only active indicator.

Before (line ~88):
```tsx
const supported = (item.kind === "image" || item.kind === "video") && Boolean(item.filePath);
```

After:
```tsx
const isElement = item.kind === "element";
const supported = isElement || ((item.kind === "image" || item.kind === "video") && Boolean(item.filePath));
```

Add early return for element kind (read-only badge, no toggle):
```tsx
if (isElement) {
  return <span className="asset-element-toggle is-active" aria-label={label}>
    <span className="asset-element-toggle__glyph" aria-hidden="true">@</span>
  </span>;
}
```

## TESTS

No new test files — existing build + visual verification suffice for C2.

## Verification (C)

```bash
cd ui && npm run build   # exit 0
```
Visual: Element Library page shows thumbnails and @ badges on all element cards.
