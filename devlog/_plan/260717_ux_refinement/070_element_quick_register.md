---
created: 2026-07-17
tags: [ima2-gen, ux, assets, element-library, mentions]
---

# 070 — Asset @ quick registration

## Loop spec

- Archetype: spec-satisfaction repair.
- Trigger: the gallery/Assets star means favorite/share-to-Assets, but users expected a separate one-click path into Element Library and the Create `@` mention menu.
- Goal: add an independent `@` toggle beside the Assets-card star; only the glyph turns red when active, and a registered source becomes a real `kind=element` record consumable by generation.
- Non-goals: changing star/favorite semantics, redesigning Element types, adding a new server/store abstraction, touching `ui/src/components/agent/*`, shipping/pushing, or absorbing unrelated dirty-worktree changes.
- Verifier: focused route/helper/UI contract tests, `npm run typecheck`, `cd ui && npm run build`, `git diff --check`, and local browser observation on Assets/Create.
- Stop: add/remove survives reload, remains independent from `starred`, Create shows/removes the item in `@` suggestions, and the scoped commit contains no parallel hunk.
- Memory: this document, `090_deferred_ledger.md` D01/D03, and the bound goalplan `ima2-gen-element-library-create-ui-element-libra`.
- Terminal: DONE / BLOCKED(dirty owner cannot be isolated) / UNSAFE(unrelated state would be committed) / NEEDS_HUMAN(contract conflict) / BUDGET_EXHAUSTED(45 min or two Sol-high audit passes).
- Escalation: two failed repairs of the same failure enter root-cause mode; a third returns to P.
- Resources: local repo and local browser only; no credentials or paid external APIs; write scope below; one Sol-high A reviewer plus at most one follow-up; wall-clock 45 minutes.

## Design Read

```yaml
name: ima2-gen asset element toggle
colors:
  primary: "#f4f4f6"
  accent: "#ef4444"
  background: "#0b0b0f"
typography:
  heading: { fontFamily: "existing UI sans", fontSize: "unchanged" }
  body: { fontFamily: "existing UI sans", fontSize: "unchanged" }
iconography:
  system: "existing project controls"
  weight: "regular; heavier glyph when selected"
  domain: "literal @ glyph"
```

Reading: dense repeated-work AI studio for creators. Preserve the current dark media overlay language; the `@` is a domain glyph, not decoration. The user explicitly fixed the microinteraction: star then `@`, with no red pill/background—only the active glyph becomes red.

- Do: match the star's scrim, geometry, target size, event isolation, focus ring, and mobile 44px target.
- Don't: merge star and Element state, add a modal, recolor the button background, use an emoji, or infer Element membership from color alone (`aria-pressed`, stateful label/title, and heavier active glyph carry the non-color contract).
- DESIGN_VARIANCE: 2
- MOTION_INTENSITY: 1
- Product density: D5
- Reasoning: this is a utility toggle inside an established dense studio, so clarity and state fidelity matter more than visual novelty.
- Concept generation: skipped because the user supplied an implementation-ready placement, glyph, and active-state direction.

## Existing contract and reuse decision

- Reuse `POST /api/assets/promote-element` and `DELETE /api/assets/:id`; no new route. The one-click default `elementKind` is explicitly `character`; users can refine it later in Element detail.
- Reuse `kind=element`, `metadata.elementKind`, `metadata.refs`, and generation's element-id compiler path. The UI sends `sourceAssetId`; the route verifies that source asset exists and owns the same canonical `filePath`, then persists `metadata.sourceAssetId` and server-owned tag `element-source:<assetId>` without mutating the source asset.
- Make promotion sequentially idempotent: when `sourceAssetId` is present, the route first queries `kind=element + element-source:<assetId>` and returns that record instead of creating a duplicate. The tile's pending guard closes same-instance concurrency; route tests cover a repeated request. Database-level uniqueness is not added because this local single-user UI has no independent concurrent writer contract.
- Reuse the current `assets.actionFailed` and `assets.elementLibrary` translations; no dirty en/ko edits.
- Reuse the existing card overlay language in `assets-workspace.css`; no new design-system token or dependency.
- Reject do-nothing/configure/delete: the current route exists but has no source-card action or reversible source linkage, and the composer incorrectly derives mention options from whatever Assets filter last hydrated the global list.

## File change map

| State | Path | Diff-level change |
|---|---|---|
| MODIFY | `routes/assets.ts` | Make `promote-element` create store-valid metadata including normalized display name, notes and verified `sourceAssetId`; server-add the marker tag and return the existing linked Element on sequential retries. |
| MODIFY | `tests/assets-routes-contract.test.ts` | Add route-level add/retry/delete proof: default kind, marker tag, source-id/name/ref metadata, no duplicate, source file retention, mismatched source rejection. |
| MODIFY | `ui/src/lib/api-assets.ts` | Extend the existing typed `PromoteToElementParams` with required `sourceAssetId` for the quick-register caller; preserve the same route and response shape. |
| NEW | `ui/src/lib/elementMembership.ts` | Paginate all `kind=element` records, define source-marker helpers, and resolve the preview ref. |
| NEW | `ui/src/components/assets/AssetElementToggle.tsx` | Return `null` unless the source is an image/video with a file path; otherwise use a shared module-level membership snapshot (one load for all virtualized tiles), independent pending guard, promote/delete mutation, semantic `button`, `aria-pressed`, and isolated card events. |
| MODIFY (additive hunk only) | `ui/src/components/assets/AssetsGrid.tsx` | Import and render `AssetElementToggle` immediately after the existing star. Preserve every pre-existing dirty line and stage only the two additive `@` hunks. |
| MODIFY | `ui/src/components/PromptComposer.tsx` | Always load the paginated Element-only list on each Create mount, independently of the current Assets array/filter, and derive thumbnails from `metadata.refs[0]`; no mutation of mention keyboard/menu ownership. Assets and Create are mutually exclusive routed workspaces, so remount is the post-promotion refresh boundary.
| MODIFY | `ui/src/styles/assets-workspace.css` | Position `@` to the right of the star, share overlay geometry, color only the active glyph red, add visible focus/forced-colors and 44px coarse-pointer target. |
| NEW | `tests/asset-element-toggle-contract.test.ts` | Lock pagination, marker lookup, star independence, semantic state, placement, and composer hydration contracts. |
| MODIFY | `devlog/_plan/260717_ux_refinement/070_element_quick_register.md` | Record C evidence and commit receipt at D. |

Out of scope and read-only: untracked `FavoriteStarButton.tsx`, `favorite-star.css`, `ElementMentionMenu.tsx`, `elementMention.ts`, dirty i18n/store/App files, generated test inventory, and all other status entries.

## Before / after

```diff
 <FavoriteStarButton ... />
+<AssetElementToggle item={item} />
 <button className="assets-tile__delete" ... />

-const elements = useMemo(() => allAssets.filter((asset) => asset.kind === "element"), [allAssets]);
+const [elements, setElements] = useState<AssetItem[]>([]);
+useEffect(() => { void loadAllElementAssets().then(setElements) ... }, []);

-const metadata = { elementKind: body.elementKind, refs: [ref] };
+const metadata = { elementKind, name, refs: [ref], sourceAssetId, ...notes };
+const existing = sourceAssetId ? listAssets({ kind: "element", tag: sourceTag, limit: 1 }).assets[0] : null;
+if (existing) return res.status(200).json({ asset: existing });
```

## Acceptance and activation scenarios

| Scenario | Trigger | Observable proof |
|---|---|---|
| Add | Open Assets All, click inactive `@` on an image | client sends explicit `character` + source asset id; only `@` becomes red/heavier, `aria-pressed=true`, star state unchanged, Element Library contains a linked element. |
| Mention | Return to Create, type `@` plus source name | suggestion appears with source thumbnail; selection inserts the element tray/tag and sends a real element id. |
| Remove | Return to Assets and click active `@` | quick-created element record is deleted, source media remains, `@` returns neutral, subsequent Create suggestions omit it. |
| Reload | Reload Assets after add | marker-tag lookup restores active state without relying on component-local optimistic state. |
| Sequential retry | Submit promotion twice with the same source asset id | second response returns the same Element id and the database contains one linked record. |
| Failure | Force promote/delete non-2xx | pending clears, state does not flip, existing `assets.actionFailed` toast appears. |
| Source mismatch | Send an unknown source id or a source whose canonical path differs from the promoted ref | route rejects with a typed 400/404 envelope; no Element is created. |
| Unsupported tile | Render an element, preset, template, or source without `filePath` | no `@` button is rendered and no request path is reachable. |
| Star independence | Toggle star before/after `@` | `starred` lives on source tags; Element marker lives on the separate Element record; neither mutation changes the other. |
| Mobile | 390px/coarse pointer | star then `@` remain visible, do not overlap delete, each target is 44px, only glyph color changes. |

## Verification plan

```bash
node --import tsx --test tests/assets-routes-contract.test.ts tests/asset-element-toggle-contract.test.ts
npm run typecheck
cd ui && npm run build
git diff --check
```

Render grounding: use the local served app, inspect desktop Assets add/reload, Create mention selection, Assets removal, then repeat card placement at 390px. Read the resulting screenshots and DOM (`aria-pressed`, accessible name, computed glyph color). Persist final desktop/mobile evidence under this unit's `assets/` folder. Generated `docs/migration/runtime-test-inventory.md` remains unstaged because the parallel test inventory is owner-shared.

## A audit synthesis

Round 1 — `gpt-5.6-sol`, reasoning high, priority — `VERDICT: GO-WITH-FIXES (blockers=3)`.

1. Payload/store mismatch accepted: `promote-element` omitted metadata `name` and the quick action had no explicit default kind. Plan now fixes server-valid metadata, defaults the one-click path to `character`, and adds a real route success test.
2. Membership/idempotence accepted and strengthened: the marker tag remains the efficient lookup key, while `metadata.sourceAssetId` becomes the durable semantic link. The route verifies source/path ownership and returns an existing marker-linked Element on repeated requests. Full DB uniqueness was not added because the local UI has one guarded writer; the route retry test plus tile pending guard are the bounded contract.
3. Composer hydration accepted: the plan no longer relies on global `assets` content. Create mounts a paginated Element-only loader every time; this route remount is the refresh boundary after leaving Assets.

Round 2 — same `gpt-5.6-sol`, reasoning high, priority — `VERDICT: GO-WITH-FIXES (blockers=2)`. Both are accepted: `ui/src/lib/api-assets.ts` is now an explicit MODIFY owner for typed `sourceAssetId`, and `AssetElementToggle` is gated to file-backed image/video sources with a negative contract test for element/preset/template/missing-file cards.

Round 3 — same `gpt-5.6-sol`, reasoning high, priority — `VERDICT: PASS`. The reviewer confirmed typed payload ownership, unsupported-tile gating, metadata/idempotency, Composer pagination, and dirty-index staging; no High/Critical blocker remained.

Dirty-file judgment accepted: `AssetsGrid.tsx` receives only one import and one render line. Whole-file staging is forbidden; the commit must be assembled from an index patch and inspected with `git diff --cached`/`git show --stat`.

## D evidence

- Implementation checkpoint: `04ebbe4 feat(assets): add independent Element @ toggle` (10 scoped files, 509 insertions, 18 deletions). `AssetsGrid.tsx` contributes only the planned import and render lines; no push was performed.
- Focused contracts: `node --import tsx --test tests/assets-routes-contract.test.ts tests/asset-element-toggle-contract.test.ts` — 12/12 passed.
- Static/build gates: `npm run typecheck` passed; `npm run ui:build` passed with only the existing Vite chunk-size warning.
- Diff hygiene: `git show --check 04ebbe4` and the scoped work-phase diff check passed. A whole-worktree `git diff --check` remains noisy only because parallel skill-reference files have unrelated EOF whitespace; those files were not edited or staged by this work-phase.
- Runtime add/independence: on the current source runtime (`IMA2_PORT=3334 ./node_modules/.bin/tsx server.ts`), clicking the `@` for source `a_01KXK936E0QXQH0HV0GK8N8388` returned `POST 201`; `aria-pressed` changed `false → true`, computed glyph color became `rgb(239, 68, 68)` with weight `850`, the star stayed `aria-pressed=false`, and the source record remained intact.
- Runtime mention: Element Library showed the marker-linked record; Create search `@Renamed` returned `Renamed by QA 070 · character` with its source thumbnail. Selecting it inserted `@Renamed_by_QA_070` and produced `Reference tray, 1 of 5`.
- Runtime remove/cleanup: clicking the active `@` returned `DELETE 200`; `aria-pressed` returned to `false`, the source image remained queryable, the marker query returned no Element records, and Create then showed `No matching elements` for `@Renamed`.
- Responsive/a11y: desktop and 390px screenshots show star-then-`@` placement with the active glyph alone red and no overlap. DOM inspection covered stateful accessible labels, `aria-pressed`, and `aria-busy`; CSS contracts cover focus-visible, forced-colors, reduced motion, and a 44px coarse-pointer target.
- Evidence: [desktop active state](./assets/evidence-070-element-active-desktop.png), [390px active state](./assets/evidence-070-element-active-mobile.png).
- Runtime note: the pre-existing app process on port 3333 was serving stale compiled server JS and correctly exercised the failure path without flipping state. Restarting it after a server build is required for that process to pick up the route implementation; the latest TS source runtime above is the authoritative end-to-end proof.
