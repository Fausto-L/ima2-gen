# 000 — element-library-fixes: Plan

## Objective

Fix two UI bugs in the Element Library view:
1. Element asset cards show "E" placeholder instead of actual reference images
   when `filePath` is null (element created via promote-to-element with no
   direct filePath, only `metadata.refs[]`).
2. The `@` mention indicator badge is missing from Element Library items —
   `AssetElementToggle` only renders for `kind=image|video`, not `kind=element`.

Evidence: API response for element `a_01KXQZXJSWEERY7A2PT5WXQ1V7` has
`filePath: null` and `metadata.refs: ["1784131394336_776db756_0.png"]`.
`/generated/1784131394336_776db756_0.png` returns HTTP 200.

## Loop-spec

- Loop archetype: verifier-defined (build passes + visual check)
- Write scope: `ui/src/components/assets/{AssetsGrid,ElementDetail,AssetElementToggle}.tsx`
- Out-of-scope: server APIs, generation pipeline, prompt composer popup
- Budget: single PABCD cycle (C2)

## Work-phase map

| WP | Doc | Slice | Depends on |
|----|-----|-------|------------|
| 1  | 010 | Element image display + @ badge | — |

## Accept criteria

1. Element cards show first ref image as thumbnail (not "E" placeholder)
2. ElementDetail edit panel shows reference images (correct URL path)
3. Element kind items show `@` badge (active state)
4. `cd ui && npm run build` passes
