# 080 — 결과 프레임·Assets 카드 별표 표면 통일 (wp9)

## Loop spec

- Archetype: spec-satisfaction repair, C2 ordinary product slice.
- Trigger: 사용자 브라우저 코멘트 — Create의 큰 결과 프레임과 Assets 그리드 카드에서도 별표를 바로 누를 수 있어야 함.
- Goal: 별표를 세 표면(갤러리·현재 결과·Assets 카드)에 일관되게 노출하되, 070의 상태 계약을 보존한다.
- Non-goals: 새 저장소/API/라우트, 별표 OFF 시 반대편 자동 해제, Assets 삭제와 갤러리 favorite 결합, 새 필터/설정.
- Verifier: 신규 source/behavior contract, 기존 070 계약, typecheck/build, 브라우저에서 결과→에셋 입장과 Assets 독립 토글 관찰.
- Stop: 결과 프레임 ★ ON이 gallery favorite + asset 입장을 만들고, Assets 카드 ★ OFF가 asset `starred` 태그만 제거하며 gallery favorite는 유지; 재ON 복원; 모든 게이트 green.
- Memory: 이 문서 + `.codexclaw/goalplans/.../ledger.jsonl` + `evidence-080-*.png`.
- Terminal: DONE / BLOCKED(병행 변경 충돌로 안전한 패치 불가) / NEEDS_HUMAN(상태 의미 충돌 발견).
- Escalation: A reviewer가 3회 연속 blocker를 닫지 못하면 P 재계획. 두 worker가 같은 구현 패킷에 실패하면 main이 회수.

## Design Read

```yaml
name: ima2-gen star controls
colors: { primary: "existing neutral tokens", accent: "existing amber favorite state", background: "existing dark surfaces" }
typography: { heading: "existing UI stack", body: "existing mono/system stack" }
iconography: { system: "custom inline SVG matching existing utility icons", weight: "regular/fill by state", domain: "library-free existing project convention" }
```

반복 작업용 AI 생성 도구의 고밀도 미디어 표면. 별은 기능을 설명하는 별도 카드가 아니라 미디어 위의 작고 영구적인 상태 컨트롤이다.

- Do: 비활성도 발견 가능, 활성은 채움+amber, `aria-pressed`, pointer/touch 모두 동작, 카드/뷰어 클릭과 이벤트 분리.
- Don't: 새 Save 버튼 중복, hover-only, 별표와 삭제 위치 충돌, Assets에서 gallery favorite까지 역결합.

`DESIGN_VARIANCE: 3`, `MOTION_INTENSITY: 1`, density `D6`. 이유: 반복 작업 툴이라 상태 인식과 짧은 포인터 이동이 장식보다 중요하다. utility CRUD/기존 디자인 시스템 확장이므로 concept generation은 생략한다.

## 상태 계약

| 표면 | 클릭 상태 owner | ON | OFF |
|---|---|---|---|
| Gallery tile (기존) | `galleryFavorites` + history | favorite 저장 + `starAssetSync`로 Assets 입장 | gallery favorite만 해제 |
| Current result frame (신규) | Gallery와 동일 owner | Gallery와 동일한 `toggleGalleryFavorite(currentImage)` | gallery favorite만 해제, asset 유지 |
| Assets tile (신규) | `asset.tags` | `starred` tag union | `starred` tag만 제거, gallery favorite 유지 |

## 현재 코드와 재사용 결정

- `storePromptImpl.toggleGalleryFavoriteImpl(item)`이 070의 입장-동시/해제-독립 계약을 이미 구현. 결과 프레임은 이를 그대로 호출한다.
- `storeAssetsImpl.updateAssetItemImpl(id,{tags})`이 Assets 카드 상태 owner. 신규 store/API 없음.
- Gallery는 `GalleryImageTile.tsx`의 Unicode ★/☆ + `.gallery__favorite` CSS. 세 표면에서 접근성/아이콘을 통일하려면 신규 presentational component 하나가 정당화됨.
- baseline focused suite: 32 tests 중 31 pass, 기존 `asset-gen-media-lightbox-contract.test.js` 1 fail. 원인은 병행 변경이 helper를 `toPreviewItem`→`assetToPreviewItem`로 이동했는데 stale regex가 남은 것. **B step 1에서 현재 owner 이름만 교정**하고, assertion 범위와 preview/select/delete 보장은 약화하지 않는다.

## A audit synthesis (GO-WITH-FIXES, blockers=5)

1. **Result active SoT — accepted.** `currentImage.isFavorite`는 OFF 뒤 stale할 수 있고 hydration은 `history[].isFavorite`를 보존하지만 Set을 항상 채우지 않는다. Canvas는 같은 filename의 live `history` row가 있으면 그 row의 `isFavorite`을 사용하고, row가 없을 때만 `galleryFavorites.has(filename)`으로 fallback. 둘을 OR하지 않는다. result-local pending으로 중복 토글 차단.
2. **Asset pending — accepted.** 전역 `assetsLoading`을 쓰지 않고 `AssetTile` local pending. ON은 `new Set([...tags,"starred"])`, OFF는 `filter(tag!=="starred")`; PATCH 성공 뒤 store가 반영하므로 optimistic mutation 없음. 실패 toast, prior pressed 상태 유지.
3. **Propagation/a11y/layer — accepted.** 공통 버튼은 `type=button`, `aria-pressed`, state label, `disabled/aria-busy`, decorative SVG. `pointerdown`, `click`, `doubleclick`, key bubbling을 차단하되 native Enter/Space activation은 유지. result z-index는 DRAG(4)보다 높고 우상단, asset은 delete 반대편 좌상단.
4. **Activation proof — accepted.** hydrated initial ON, stale currentImage OFF, PATCH failure truth preservation, unrelated-tag preservation, double-click suppression, parent selection/preview isolation을 신규 계약/브라우저 시나리오에 추가.
5. **Dirty collision — rebutted with stronger preservation gate.** 해당 prior writer는 완료 후 이 작업에 새 output이 없고 target hashes가 5초 간격 두 번 동일했다. 현재 working tree를 authoritative baseline으로 고정: `AssetsGrid 875a288d…`, `storeAssetsImpl 972a5646…`, `assets-workspace.css 7bacc85f…`. 기존 preview/select/delete hunks는 수정/되돌림 금지. stale lightbox assertion은 B의 첫 테스트 수정으로 `assetToPreviewItem` 현재 owner를 가리키게 하고, 원 contract + browser preview/detail/delete isolation을 C에서 다시 검증한다. hash 자체는 우리 변경으로 달라지므로 C는 diff review + contract로 보존을 증명한다.

## Diff-level plan

1. NEW `ui/src/components/controls/FavoriteStarButton.tsx`
   - props: `active`, `label`, `variant: gallery|result|asset`, `busy?`, `onToggle`.
   - semantic `<button aria-pressed disabled aria-busy>` + decorative inline SVG star; inactive outline, active fill.
   - pointer-down/click/double-click/key bubbling 차단. key handler는 bubbling만 막고 preventDefault하지 않아 native Enter/Space click을 보존.
2. MODIFY `ui/src/components/controls/index.ts`
   - `FavoriteStarButton` export.
3. MODIFY `ui/src/components/GalleryImageTile.tsx`
   - 기존 Unicode button을 공통 컴포넌트로 교체. favorite 동작/label 유지.
4. MODIFY `ui/src/components/Canvas.tsx`
   - `history`, `galleryFavorites`, `toggleGalleryFavorite` 구독 + result-local pending.
   - `currentImage.filename`이 있으면 `result-preview-frame` 우상단에 result variant. active는 matching live history row 우선, 없을 때 Set fallback(절대 stale currentImage와 OR하지 않음); async toggle await/finally.
5. MODIFY `ui/src/components/assets/AssetsGrid.tsx`
   - `AssetTile`에서 `updateAssetItem`, local pending. active=`item.tags.includes("starred")`.
   - ON은 deduped union, OFF는 starred만 filter; await update, 실패 toast, optimistic mutation 없음. busy 중 disabled; 카드 선택/preview/delete 클릭과 propagation 분리.
6. NEW `ui/src/styles/favorite-star.css`; MODIFY `ui/src/index.css`
   - 공통 36px target, result 우상단/asset 좌상단, hover/focus/active; `(hover:none)` 항상 충분한 opacity; no layout shift.
   - 기존 `.gallery__favorite` 위치/hover 규칙은 variant wrapper로 호환하거나 중복 제거.
7. TEST `tests/star-surface-controls-contract.test.ts`
   - 공통 SVG/aria-pressed/busy, hydrated history 우선+Set fallback, stale currentImage OFF, Assets tag-only union/filter, PATCH failure prior state, busy double-submit 차단, parent-event isolation, labels 계약.
   - 기존 070 behavior suite로 입장/해제 독립 회귀.
   - `asset-gen-media-lightbox-contract.test.js` stale helper assertion을 `assetToPreviewItem`로 교정(기존 preview/select/delete 동작을 약화하지 않음)하고 focused command에 포함.
8. Inventory regeneration/check if a new test file is added.

## Activation scenarios

- Current result inactive→ON: `/api/history/favorite` returns true; `starAssetSync` creates/tags asset; button becomes pressed/filled. Browser checks starred asset appears.
- Current result ON→OFF: button unpresses; matching asset remains.
- Assets tile active→OFF: PATCH removes only `starred`, leaves all other tags; Gallery result remains favorite/pressed.
- Assets update failure: button stays prior state because store changes only after successful PATCH; error toast visible.
- Assets reON: PATCH unions `starred` without duplicating other tags.
- Hydrated initial favorite: Set이 비어 있어도 matching history row `isFavorite=true`면 pressed.
- Stale `currentImage.isFavorite=true` after OFF: matching history row false가 pressed를 해제.
- Busy double activation: 두 번째 호출은 disabled라 PATCH/favorite request가 한 번만 발생.
- Parent isolation: star pointer/click/doubleclick/Enter/Space가 viewer pan/open 또는 tile select/preview를 추가로 호출하지 않음.

## Acceptance

- Desktop 1440 and mobile 390 screenshots: result frame star accessible; Assets tile star visible/tappable and non-overlapping with delete.
- Keyboard: buttons reachable, visible focus, Enter/Space toggles, `aria-pressed` matches state.
- `node --import tsx --test tests/star-surface-controls-contract.test.ts tests/assets-star-rename-contract.test.ts tests/asset-gen-media-lightbox-contract.test.js` green (lightbox baseline repair 포함).
- affected existing suites, `npm run test:inventory`, root/test typecheck, UI tsc/build exit 0.
