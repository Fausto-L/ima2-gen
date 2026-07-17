---
created: 2026-07-17
tags: [ima2-gen, ux, deferred, ledger, worktree]
---

# 090 — UX refinement 단일 이월 원장

## Loop spec

- Archetype: ledger-consolidation / docs-only closeout gate.
- Trigger: 현재 UX refinement의 WT 충돌 목록과 260712 Higgsfield closeout의 미결정 목록이 서로 다른 문서에 흩어져 있다.
- Goal: 중복을 정규화한 단일 원장으로 병합하고 각 항목에 차단 파일, 재개 조건, 권장 후속 unit을 부여한다.
- Non-goals: 이월 항목 구현, WT 파일 수정/정리, product decision 대리 결정, old closeout 삭제.
- Verifier: 두 source 목록의 항목 수/의미 대조, 현재 read-only WT snapshot, 표 column completeness, 경로 실재 검사.
- Stop: 002의 9개 범주와 old closeout 8개 항목이 누락 없이 D01–D19로 정규화되고(D17–D19는 이 유닛 A 감사 라운드가 추가), 각 행에 재개 가능한 next action이 있다.
- Memory: 이 문서, `002_code_friction_inventory.md`, `260712_higgsfield-ux-studio/090_closeout.md`, `081_wp8_design_read.md:63`.
- Terminal: DONE / NEEDS_HUMAN(후속 제품 결정) / BLOCKED(WT owner 불명).
- Escalation: 후속 unit 활성화 시 관련 WT가 clean이 아니면 해당 행을 유지하고 구현하지 않는다.

## 현재 근거와 운영 규칙

이 문서는 `002_code_friction_inventory.md:37-47`의 WT 충돌 항목과
`260712_higgsfield-ux-studio/090_closeout.md:32-46`의 미결정 원장을 한 곳에 병합한다.

현재 read-only 근거 예:

```text
M  ui/src/components/GalleryImageTile.tsx
M  ui/src/lib/mcpProviders.ts
M  ui/src/store/storeTypes.ts
M  ui/src/styles/right-panel.css
?? ui/src/components/ElementMentionMenu.tsx
?? ui/src/components/node-canvas/
```

- `blocked-wt`: 병렬 worker가 소유한 파일이 clean/landed 되기 전 구현 금지.
- `decision`: 제품/아키텍처 결정을 먼저 내려야 하며 현재 UX refinement에 임의 편입 금지.
- `verify-close`: 과거 미결정이 HEAD에서 구현된 정황이 있어 별도 검증 후 해소 처리할 후보.
- 재개할 때는 해당 행을 지우지 않고 후속 unit/결정/증거 링크와 상태를 갱신한다.
- 아래 WT 상태는 2026-07-17 KST read-only `git status --short` snapshot이다. 다른 worker의 파일을 restore/stash/checkout하지 않는다.

## 파일 변경 맵

| 상태 | 파일 | 변경 |
|---|---|---|
| NEW | `devlog/_plan/260717_ux_refinement/090_deferred_ledger.md` | 두 원장 + A 감사 추가분을 D01–D19 단일 표로 병합. |

source인 `002_code_friction_inventory.md`, old `090_closeout.md`, `081_wp8_design_read.md`와 모든 WT 파일은 READ-only다.

## Before / after diff

```diff
--- /dev/null
+++ b/devlog/_plan/260717_ux_refinement/090_deferred_ledger.md
@@
+| ID | 상태 | 내용 | 차단 사유 / 현재 WT 파일 | 재개 조건 | 권장 후속 유닛 |
+| D01 | blocked-wt | Star/favorite 전 계약 | GalleryImageTile/storePromptImpl/FavoriteStarButton WT | wp9 landing + contract handoff | assets favorite unit |
+...
+| D12 | verify-close | Assets JSON vs SQLite | HEAD SQLite 구현 정황 | migration/docs proof | storage closeout |
+...
+| D16 | decision | 립싱크/TTS | provider/product 결정 미정 | stable capability + consent | discovery unit |
```

병합 규칙은 source 문장을 복사해 나열하는 것이 아니라, lineage/비용/home처럼 002가 old 090을 요약한 중복을 한 행으로 정규화하는 것이다.

## 통합 이월 표

| ID | 상태 | 내용 | 차단 사유 / 현재 WT 파일 | 재개 조건 | 권장 후속 유닛 |
|---|---|---|---|---|---|
| D01 | blocked-wt | Star/favorite 전 계약: gallery star UI, prompt favorite state, Assets sync/error/undo 의미를 하나의 source-of-truth로 정리 | `M ui/src/components/GalleryImageTile.tsx`; `M ui/src/store/storePromptImpl.ts`; `?? ui/src/components/controls/FavoriteStarButton.tsx` — wp9 병렬 소유 | wp9가 랜딩되고 세 파일이 clean; favorite on/off와 Assets sync의 최종 계약/테스트를 인수인계 | `2607xx_assets_favorite_contract` |
| D02 | blocked-wt | `McpReferenceSlots`의 CSS, Assets hydration, local attach lifecycle 완결 | `M ui/src/styles/right-panel.css`; `M ui/src/store/storeTypes.ts`. `McpReferenceSlots.tsx` 자체는 clean이나 두 owner 없이는 안전한 상태/레이아웃 확장 불가 | right-panel/store 타입 WT 랜딩, persisted/local reference shape 고정, provider capacity negative 확정 | `2607xx_mcp_reference_inputs_hydration` |
| D03 | blocked-wt | `ElementMentionMenu` ARIA/keyboard/영어 하드코드와 `ElementMentionChip` dead-code 여부 정리 | `?? ui/src/components/ElementMentionMenu.tsx`; `?? ui/src/lib/elementMention.ts`. 병렬 element lane가 아직 untracked | element lane 랜딩 후 실제 호출자/keyboard contract 재감사, chip 사용 여부 결정 | `2607xx_element_mention_a11y` |
| D04 | blocked-wt | `mcpProviders.ts` 내부 refresh loading, stale polling error, transport error normalization | `M ui/src/lib/mcpProviders.ts` — 040은 component-local busy만 허용 | MCP transport WT 랜딩 + hook/public return shape 고정; stale response 재현 fixture 확보 | `2607xx_mcp_provider_transport_states` |
| D05 | blocked-wt | schema drift 발생 시 generate/reconnect action lock 및 typed reason 노출 | `M ui/src/lib/mcpProviders.ts`; `GenProviderModelSelect.tsx`는 clean이지만 drift source가 WT | snapshot diff/error taxonomy 랜딩, lock이 billing/connection lock과 구분된다는 제품 결정 | `2607xx_mcp_schema_drift_action_lock` |
| D06 | blocked-wt | node-canvas/video-motion/Extend의 fire-and-forget 경로를 await/error/progress/cancel 계약으로 정리 | `M ui/src/components/Canvas.tsx`; `M ui/src/store/storeVideoImpl.ts`; `?? ui/src/components/node-canvas/`; `?? ui/src/lib/videoMotionSelection.ts`; `?? lib/videoMotionPresets.ts`; `?? tests/video-motion-presets.test.ts` 등 080 lane | 080/node/video lane 전체 랜딩, action owner와 cancellation boundary 확정, baseline tests green | `2607xx_node_video_async_feedback` |
| D07 | blocked-wt | 모바일 최상단 provider/model pill 라벨 절단(`GP`/`5.6`) 개선 | 근거 `260715_subscription-mcp-providers/081_wp8_design_read.md:63`; layout 후보 `ui/src/styles/canvas-accordion.css:244-257`는 clean이나 `M ui/src/lib/mcpProviders.ts`, `M ui/src/store/storeTypes.ts`, `M ui/src/App.tsx`의 mode/provider contract와 접점 | MCP/앱 mode WT 랜딩 후 390px 실제 longest provider/model labels로 재측정 | `2607xx_mobile_provider_model_pills` |
| D08 | blocked-wt | `GalleryModal.tsx`, `right-panel.css` 500줄 초과 분할 | `M ui/src/components/GalleryModal.tsx`; `M ui/src/styles/right-panel.css` | 각 owner WT 랜딩 후 line count/책임 경계 재측정, behavior change 없는 split 계획 작성 | `2607xx_gallery_right_panel_modularity` |
| D09 | decision | 기록된 `parentId`/`presetIds`/`elementIds`를 탐색하는 lineage 뷰(계보 tab/filter)를 만들지와 시점 결정 | 직접 WT 차단 아님. metadata/continuity 기록은 존재하지만 사용자-facing IA와 query owner 미정 | 실제 lineage 탐색 수요, 최소 query shape, gallery/history/Assets 중 owner 결정 | `2607xx_lineage_view_discovery` |
| D10 | decision | Generate 버튼에 credit/비용 예상치를 병기 | 직접 WT 차단 아님. provider별 billing certainty와 unknown 표시 정책 미결정 | provider별 estimate source/오차/unknown 계약과 legal copy 승인 | `2607xx_generation_cost_disclosure` |
| D11 | blocked-wt | Home을 기본 진입 mode로 변경할지 결정 | 제품 결정에 더해 `M ui/src/App.tsx`, `M ui/src/components/NavRail.tsx`가 asset-gen/home 병렬 변경 중 | WT 랜딩 후 persisted mode/hash/back-button/first-run analytics 실사용 관찰; 기본값 결정 | `2607xx_home_default_entry_decision` |
| D12 | verify-close | Assets 저장 형식 JSON vs SQLite 결정 | 과거 decision. 현재 HEAD `lib/db.ts:273-292`에 `asset_folders`/`assets` SQLite schema, `lib/assetsStore.ts:411-497`에 CRUD가 존재해 SQLite로 사실상 결정된 정황 | migration/backup/CRUD 테스트와 docs SoT를 확인하고 “SQLite” 결정일/근거를 구 closeout에 기록 | `2607xx_assets_storage_closeout` |
| D13 | verify-close | ffmpeg concat 내보내기와 서버 의존성 수용 여부 | 과거 decision. 현재 HEAD `lib/videoConcat.ts:1-60`, `routes/mcpMedia.ts:141-151`에 local concat 구현 정황 | 실제 export UI/API activation, ffmpeg-unavailable negative, cancellation/cleanup 테스트를 확인 후 해소 | `2607xx_video_concat_closeout` |
| D14 | decision | 비디오 동기 compare 뷰 | 직접 WT 차단 아님. 비교 UX, sync 기준(frame/time/audio), 수요가 미확정 | 사용자 수요/benchmark와 최소 2-up playback prototype 승인 | `2607xx_video_compare_discovery` |
| D15 | decision | CLI MCP 서버(`ima2 mcp`)를 제품화 | 직접 WT 차단 아님. 현재 grep에서 canonical CLI command 근거가 확인되지 않았고 레인 밖 후보 | command/tool surface, auth/security, stdio lifecycle RFC 승인 후 `_plan/_future/` 편입 | `2607xx_ima2_mcp_server_rfc` |
| D16 | decision | 립싱크/TTS provider-native 지원 시 제품화 | 직접 WT 차단 아님. provider capability/비용/권리/오디오 UX 미정 | 지원 provider의 stable contract + 비용/consent + asset/audio lifecycle 결정 | `2607xx_lipsync_tts_discovery` |
| D17 | blocked-wt | en/ko 파일 끝 dotted-root `"assets.clearAll"`/`"assets.clearConfirm"` dead key 제거 | `M ui/src/i18n/en.json`; `M ui/src/i18n/ko.json` — 병렬 수정 중, 010은 additive-only nested shadow만 추가 | JSON 병렬 diff 랜딩 후 dotted-root 삭제 + 010 테스트의 LEGACY_DOTTED_ROOTS를 빈 Set으로 강화 | i18n 클린업 C1 |
| D18 | blocked-wt | `docs/migration/runtime-test-inventory.md` 최종 재생성 커밋 | `M docs/migration/runtime-test-inventory.md` — 병렬 세션 M 보유 + 병렬 신규 테스트가 재생성본에 섞임 | 병렬 테스트 레인 커밋 후 마지막 랜딩 레인이 `node scripts/classify-tests.mjs` 재생성·커밋 | inventory sync C0 |
| D19 | blocked-wt | `useMcpProviders().refresh()`가 실패를 reject/result로 반환하도록 계약 개선 | `M ui/src/lib/mcpProviders.ts` — WT 소유 | WT 랜딩 후 hook 반환 계약 정의 + 040 alert 조건 재평가 | MCP hook C2 |

## 후속 우선순위

1. WT landing 직후: D01–D08을 `git status --short -- <files>`로 재감사하고 clean이 된 항목만 독립 unit으로 승격한다.
2. verify-close: D12, D13은 새 기능 계획보다 먼저 현재 구현/테스트/문서 증거를 확인해 원장을 줄인다.
3. product decision: D09, D10, D11, D14–D16은 사용자 가치/계약 결정 전 구현 phase에 넣지 않는다.

## 테스트 계획

신규 코드 테스트 파일은 없다. 문서 계약을 다음 read-only assertion으로 검증한다.

1. `rg '^\| D[0-9]{2} '` 결과가 D01–D19 각 1회, 총 19행이다.
2. 각 행이 6개 column(ID/상태/내용/차단/재개/후속)을 모두 갖는다.
3. 002 WT 범주 9개와 old closeout 8개가 source-to-ledger checklist에서 모두 매핑된다. 중복 3개(lineage/비용/home)는 중복 행을 만들지 않는다.
4. `blocked-wt` 행의 backtick 경로가 현재 repo에 존재하거나 `??` directory owner로 확인된다.
5. `verify-close` D12/D13은 HEAD 근거 line을 가지며 “완료”로 성급히 닫지 않는다.
6. source 문서 3개와 WT 파일의 `git diff HEAD -- <file>`에 이 unit이 만든 변경이 없다.

```bash
rg -n '^\| D[0-9]{2} ' devlog/_plan/260717_ux_refinement/090_deferred_ledger.md
git status --short -- devlog/_plan/260717_ux_refinement/090_deferred_ledger.md
git diff HEAD -- devlog/_plan/260717_ux_refinement/002_code_friction_inventory.md devlog/_plan/260712_higgsfield-ux-studio/090_closeout.md devlog/_plan/260715_subscription-mcp-providers/081_wp8_design_read.md
```

## 활성화 시나리오 (C-ACTIVATION-GROUNDING-01)

| 조건부 경로 | 트리거 방법 | 관찰 신호 |
|---|---|---|
| blocked-wt 재개 | 해당 행의 모든 blocker에 `git status --short -- <files>` 실행 | 빈 출력 + owner handoff/landing 증거가 있을 때만 후속 unit 생성. 하나라도 M/??면 행 유지. |
| decision 재개 | 사용자/제품 결정과 acceptance criteria가 기록됨 | 상태를 `planned`로 갱신하고 권장 unit 경로를 실제 decade doc으로 연결. |
| verify-close 재개 | D12/D13의 targeted tests/docs/runtime path를 검증 | 증거 링크와 결정일을 남긴 뒤 `resolved`로 전환; 단순 코드 존재만으로 닫지 않음. |
| blocker drift | 원장 경로가 rename/delete됨 | `rg --files`와 history로 새 owner를 찾고 경로/재개 조건을 갱신; 항목 자동 삭제 금지. |

## Render-grounding 계획

090은 UI를 변경하지 않는 문서 전용 phase이므로 browser screenshot 대상이 없다. 대신 Markdown preview에서 표가 6열로 깨지지 않고 D01–D19 및 backtick 경로가 읽히는지 확인한다. 후속 UI unit이 활성화될 때 render-grounding은 해당 unit 문서가 소유한다.

## 완료 기준 체크리스트

- [ ] 각 항목에 내용, 차단 이유/WT 파일, 재개 조건, 권장 후속 unit이 있다.
- [ ] 002의 WT 이월 9개 범주와 Higgsfield closeout 미결정 8개가 누락 없이 병합됐다(중복 home/lineage/cost는 한 행으로 정규화).
- [ ] 현재 HEAD에서 이미 구현 정황이 있는 옛 항목은 삭제하지 않고 `verify-close`로 구분했다.
- [ ] 어떤 WT 파일도 이 문서 작성을 위해 수정/복원하지 않았다.

## Write scope clean 검증

이 phase의 유일한 write 대상은 이 신규 문서다.

```bash
git status --short -- devlog/_plan/260717_ux_refinement/090_deferred_ledger.md
git diff HEAD -- devlog/_plan/260717_ux_refinement/090_deferred_ledger.md
```

**주의 (A 감사 blocker #6):** 위 명령의 빈 출력은 "absent/clean"의 증거가 아니다 — 현재 WT `.gitignore`가 `devlog/_plan/*`를 ignore하고 `260715_subscription-mcp-providers`만 예외라서, 이 유닛의 모든 문서는 **ignored 상태**이며 status/diff에 나타나지 않는다(`git check-ignore -v`로 확인됨). 문서 존재/변경 검증은 `ls`·`git check-ignore`·파일 내용으로 한다. 이 유닛을 커밋 가능하게 만드는 `.gitignore` 예외 2줄 추가(`!devlog/_plan/260717_ux_refinement/`, `!devlog/_plan/260717_ux_refinement/**`)는 000 충돌 정책의 additive-only 예외로 로드맵 사이클 D 직전에 수행한다. 원장 갱신 시에도 read-only git 조회만 사용하며 `git add/commit/checkout/stash/restore`는 이 문서 소유 범위 밖이다.

