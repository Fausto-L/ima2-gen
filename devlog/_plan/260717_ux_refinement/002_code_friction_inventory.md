---
created: 2026-07-17
tags: [ima2-gen, ux, audit, inventory]
---

# 002 — 코드 마찰 인벤토리 (sol explorer 감사, 2026-07-17)

읽기 전용 감사 결과의 정제본. 원 감사는 HEAD 기준, `WT`=병렬 미커밋.
**이 유닛에서 구현하는 항목만 phase에 배정**하고, WT 소유 항목은 090 이월.

## 이 유닛에서 처리 (phase 배정)

| # | 심각도 | 마찰 | 앵커 | Phase |
|---|---|---|---|---|
| F1 | High | raw key `nav.home` 노출 — `nav` 객체에 `home` 키 부재 | `NavRail.tsx:121`, `en.json:1569-1577`, `ko.json` 동일 | 010 |
| F2 | High | raw key `assets.clearAll`/`clearConfirm` — flat key로 추가되어 nested-path 해석기(`i18n/index.ts:12-17` `getPath` split(".")) 미해석 | `en.json:1764-1765`, `ko.json:1764-1765`, `AssetsWorkspace.tsx:77` | 010 |
| F3 | Medium | `AssetsWorkspace.tsx:70,97` 하드코드 영어("Element test sheets are not available yet.", `${name} details`) | `AssetsWorkspace.tsx:70,97` | 010 |
| F4 | High | 닫힌 모바일 시트 focus leakage — `aria-hidden`만 변경, `inert`/`visibility` 없음, focusable 잔존 | `MobileComposeSheet.tsx:64-83`, `responsive-layout.css:117-140` | 020 |
| F5 | Medium | 시트 tabs `role="tab"`에 `id/aria-controls`/방향키 roving 없음; backdrop `div role="button"`에 tabIndex/키 핸들러 없음; opener focus 복귀 없음 | `MobileComposeSheet.tsx:68-74,90-102` | 020 |
| F6 | Medium | partial paste 시 초과 파일 silent drop (full일 때만 toast) | `PromptComposer.tsx:217-228` | 030 |
| F7 | Medium | dead tag visual-only — SR에 무효화 전달 안 됨 (`aria-hidden` mirror만) | `DeadTagMirror.tsx:80-85` | 030 |
| F8 | Low | textarea focus 시 border/box-shadow 제거 + `:focus-within` 부재로 키보드 focus 식별 약함 | `progress-composer.css:536-553` | 030 |
| F9 | Medium | `PromptComposer.tsx` 571줄 — 500줄 컨벤션 위반 (tray/mention/paste/toolbar 결합) | `PromptComposer.tsx:571` | 030 |
| F10 | Medium | MCP settings 카탈로그 fetch에 loading/retry 없음 — 로딩 중 "provider defaults" 오탐 카피 | `McpGenerationControls.tsx:43-63,111-131` | 040 |
| F11 | Medium | 빈 모델 목록에서 Select가 빈 listbox + 유령 `aria-activedescendant` 가능 | `Select.tsx:172-183,285-297` | 040 |
| F12 | Medium | MCP mode/preset 버튼 `.active` class만, `aria-pressed` 없음 | `McpGenerationControls.tsx:93-108`, `McpModelPresetControls.tsx:89-106`, `DurationSlider.tsx:42-50` | 040 |
| F13 | Medium | 수동 Refresh 반복 클릭 가능(컴포넌트 로컬 busy 없음) — `mcpProviders.ts`(WT)는 건드리지 않고 `McpProviderConnections.tsx` 로컬 상태로 처리. 주의: `refresh()`는 reject하지 않으므로(내부 setError 소비) 실패 표시는 hook `error`가 SoT | `McpProviderConnections.tsx` Refresh 버튼 onClick(라인은 040 doc이 정본) | 040 |
| F14 | Medium | 인플라이트 popup 닫기 affordance 없음(비모달 dialog, 터치 발견성 낮음) | `InFlightPopup.tsx:105-120` | 050 |
| F15 | Medium | progress track에 role/label 없음 — 진행 변화 미announce | `InFlightList.tsx:135-145` | 050 |
| F16 | Low | popup/Select/mention 전부 `z-index:220` — 레이어 토큰 정리 (WT `element-mention.css` 제외) | `inflight-tray.css:64-67`, `controls.css:130-134` | 050 |
| F17 | Medium | 모바일 Assets 폴더 CRUD 소실 (heading+actions 숨김) | `assets-workspace.css:79-89`, QA Q3 | 060 |
| F18 | Medium | rename Enter/blur 중복 PATCH 가드 없음 | `AssetsWorkspace.tsx:115-139` | 060 |
| F19 | Medium | 모바일 asset detail: dialog/focus 계약 없는 bottom-sheet 모조 | `AssetsWorkspace.tsx:97`, `assets-workspace.css:81-82` | 060 |
| F20 | Low | 폴더 트리 active 항목 `aria-current` 없음 | `AssetsFolderTree.tsx:83-91` | 060 |
| F21 | Low | Element Library 빈 상태 CTA — HEAD에 CTA 버튼이 이미 존재함(`AssetsWorkspace.tsx:87-93`, A 감사 정정). 060은 CTA "추가"가 아니라 벤치마크 대비 보강(카피/시각 계층)으로 축소 | `AssetsWorkspace.tsx:87-93` | 060 |

## WT 충돌로 이월 (090 원장)

- Star/favorite 전 계약 (`GalleryImageTile`, `storePromptImpl`, WT FavoriteStarButton) — WT wp9 진행 중.
- `McpReferenceSlots` CSS 부재/Assets hydration/local attach — `right-panel.css`+`storeTypes.ts` WT.
- `ElementMentionMenu` ARIA/영어 하드코드, `ElementMentionChip` dead code — element WT.
- `mcpProviders.ts` refresh loading, stale polling error — WT.
- schema drift action lock — `mcpProviders.ts`/`GenProviderModelSelect` WT 접점.
- node-canvas/video-motion/Extend fire-and-forget — 080 WT.
- 모바일 provider/model pill 절단(`canvas-accordion.css:244-257`) — `081_wp8_design_read.md:63` 기왕 이월분, canvas-accordion.css는 clean이지만 셀렉터 본체 WT 접점 커서 060 이후 재평가.
- higgsfield-ux-studio 090 미결정 원장(lineage, 비용 병기, 홈 기본 진입).
- `GalleryModal.tsx:590`, `right-panel.css:627` 500줄 위반 — WT 소유.
