# 020 — element-library-fixes: Closeout

closed: 2026-07-18

## Accept criteria result

| # | Criterion (000_plan.md:29-34) | Result | Evidence |
|---|---|---|---|
| 1 | Element cards show first ref image as thumbnail | PASS | `ui/src/lib/elementMembership.ts:23-26`, `ui/src/components/assets/AssetsGrid.tsx:34-37` (HEAD 5b4bf02); visual: `assets/evidence-element-card-thumb-at-badge.png` |
| 2 | ElementDetail edit panel shows reference images | PASS | `ui/src/components/assets/ElementDetail.tsx:38-40` (URL-safe `/generated/…` assembly) |
| 3 | Element kind items show `@` badge (active state) | PASS | `ui/src/components/assets/AssetElementToggle.tsx:99-103` read-only active badge; visual: `assets/evidence-element-card-thumb-at-badge.png` (top-right @ badge) |
| 4 | `cd ui && npm run build` passes | PASS | Vite build ✓ 2026-07-18 (after integration delivery 79379b7 committed the previously-untracked dependencies) |

## Delivery notes

- Criteria 1–3 shipped in HEAD commit `5b4bf02`.
- Audit caveat (closeout-sweep 000_audit.md blocker1): `5b4bf02` referenced
  then-untracked modules (`FavoriteStarButton`, `favoriteState`,
  `ElementRefGrid`, `assetPreview`), so a HEAD-only checkout was not
  independently buildable. Resolved 2026-07-18 by the lane WIP commits
  (`ddf2686`, `730e61c`, `32235ab`) + integration delivery (`79379b7`).
- Browser QA: Element Library grid at 1440 shows photo thumbnails on element
  cards and the active `@` badge (agbrowse vs local :3333, 2026-07-18).
  Full-grid capture: `assets/evidence-desktop-1440-element-section.png`.
- Full gates at close: typecheck + typecheck:tests exit 0, npm test
  1665/1665, test:inventory green, ui build green.

## Residuals

None blocking. Lane moves to `devlog/_fin/260717_element-library-fixes/`.
