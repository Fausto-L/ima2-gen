---
created: 2026-07-13
updated: 2026-07-13
tags: [ima2-gen, devlog, difflevel, roadmap, higgsfield]
---

# Higgsfield UX Studio — Diff-Level Roadmap

완료된 phase 010–060의 실제 변경 내역과, 예정된 070–090의 diff-level 구현 명세.
베이스: `dc09410` (main/preview HEAD) → dev HEAD `cbcf9e6` (14 커밋) → 현재 HEAD (060 구현 포함).
테스트: 1187 pass / 0 fail. UI 빌드 green. (2026-07-15 기준)

---

## Part I — 완료 (010–050)

### Phase 010 — 디자인 토큰 + 단일 다크 테마

커밋: `67b2e01` | 26 files | +170 / −761 + 바이너리 폰트 7개

테마 선택 제품에서 고유한 단일 다크 visual identity로 전환.

핵심 변경:

- DELETE `ui/src/components/ThemeToggle.tsx` (−117): 테마 선택 UI 전체 제거.
- MODIFY `ui/src/styles/themes.css` (+9 / −394): 5개 패밀리 규칙 → 단일 canvas/minimap 토큰.
- MODIFY `ui/src/index.css` (+98 / −53): site-texture 토큰 도입 — `#0b0b0f` 기반 팔레트,
  `body::before` corner glow, `body::after` SVG turbulence grain, prism/chrome/glass 변수.
- MODIFY `ui/index.html` (+21 / −21): theme bootstrap script → 정적 `color-scheme: dark`.
- NEW `ui/public/fonts/` (7개 woff2): Satoshi 400/500/700, Clash Display 600/700,
  IBM Plex Mono 400/500. Outfit/Geist 대체.
- MODIFY `ui/src/store/` (4개 파일): theme 관련 state, type, persistence 전부 제거.
  `storeTypes.ts` −11, `storeUIImpl.ts` −14, `useAppStore.ts` −19, `storePersistence.ts` −32.
- MODIFY `ui/src/App.tsx` (+1 / −28): ThemeToggle import 제거, theme provider 해제.

Before → After 요약:
- `:root[data-theme="light"]` + `data-theme-family=*` → 단일 `:root` 다크 토큰.
- `#0a0a0a` 팔레트 → `#0b0b0f` / `#14141a` / `#1c1c23`.
- focus ring → cyan `rgba(122, 215, 255, 0.35)`.
- typography: 단일 토큰 → body(Satoshi) / display(Clash Display) / mono(IBM Plex) 분리.

### Phase 020 — 통일 컨트롤 킷

커밋: `6d2e236` | 19 files | +631 / −119

화면별 독자 구현을 Segmented / Select / Toggle / Chip 네 primitive로 통합.

핵심 변경:

- NEW `ui/src/components/controls/Segmented.tsx` (+77): 방향키 순환, disabled 건너뛰기.
- NEW `ui/src/components/controls/Select.tsx` (+165): glass listbox, sub-label, 키보드 탐색.
- NEW `ui/src/components/controls/Toggle.tsx` (+35): `role="switch"` boolean primitive.
- NEW `ui/src/components/controls/Chip.tsx` (+63): selectable/removable pill (060/070 기반).
- NEW `ui/src/components/controls/index.ts` (+4): barrel export.
- NEW `ui/src/styles/controls.css` (+209): `.ctl-select`, `.ctl-toggle`, `.ctl-chip`.
- MODIFY `ui/src/components/OptionGroup.tsx` (+5 / −46): 46줄 직접 렌더 → Segmented shim.
- MODIFY `ui/src/components/GrokModelPicker.tsx` (+7 / −17): 독자 button → Segmented.
- MODIFY `ui/src/components/HistoryStripLayoutToggle.tsx` (+9 / −17): → Segmented.
- MODIFY `ui/src/components/ReasoningEffortSelect.tsx` (+12 / −12): native select → Select.
- MODIFY `ui/src/components/VideoControlsPanel.tsx` (+6 / −8): → Select/Segmented.
- MODIFY `ui/src/components/GenerateButton.tsx` (+1 / −1): prism foil hover 효과.
- MODIFY `ui/src/components/WebSearchToggle.tsx` (+12): `role="switch"` Toggle 적용.

Before → After 요약:
- 화면별 option button / native `<select>` / 독자 toggle → 4개 공용 primitive.
- Generate button 일반 hover → prism gradient foil overlay.
- Chip/ChipRow 도입 → 060 preset / 070 mention UI의 공통 기반.

### Phase 025 — 설정 워크스페이스 IA 재설계

커밋: `7c01ab7` | 16 files | +188 / −221

설정 정보구조를 기술적 6개 분류에서 사용자 목적 중심 3개 그룹으로 축소.

핵심 변경:

- MODIFY `ui/src/components/SettingsWorkspace.tsx` (+24 / −43):
  `SettingsSection` 6종 → `providers | workspace | general` 3종.
- MODIFY `ui/src/components/AccountSettings.tsx` (+38 / −30):
  provider별 glass card + 상태 chip (`provider-chip--ok|warn|err`).
- MODIFY `ui/src/components/GeminiKeySection.tsx` (+8 / −7): native select → kit Select.
- MODIFY `ui/src/components/ImageModelSelect.tsx` (+18 / −17): → kit Select.
- MODIFY `ui/src/components/settings/WorkspaceProfileSettings.tsx` (+6 / −11): → kit Select.
- NEW `ui/src/styles/settings-controls.css` (+64): provider card, chip tone map.
- MODIFY `ui/src/i18n/en.json` (+8 / −39): 테마/future 키 제거, 새 그룹 키.
- MODIFY `ui/src/i18n/ko.json` (+8 / −39): 동일.
- MODIFY `ui/src/store/useAppStore.ts` (+3 / −3): 기본 section `"account"` → `"providers"`.
- MODIFY `ui/src/types.ts` (+1 / −1): SettingsSection 타입 축소.

Before → After 요약:
- `account | generation | appearance | workspace | language | future` → `providers | workspace | general`.
- OAuth/API/Grok/Antigravity 일반 row → glass provider card + 상태 chip.
- native select 잔여분 → kit Select로 후속 전환.

### Phase 026 — WCAG AA 대조 + 박스 분할 완화

커밋: `690073e` | 9 files | +33 / −37

Phase 025 후속 polish — contrast hierarchy 재정의 + 과도한 card nesting 제거.

핵심 변경:

- MODIFY `ui/src/index.css` (+1 / −1): `--text-muted` `#7e7e8c` → `#90909d` (4.76:1).
- MODIFY `ui/src/styles/canvas-accordion.css` (+6 / −11): subsection opacity 제거.
- MODIFY `ui/src/styles/canvas-viewer.css` (+11 / −9): text-faint → text-muted 승격.
- MODIFY `ui/src/styles/quota-card.css` (+5 / −4): surface-2 card → flat row + divider.
- MODIFY `ui/src/styles/node-workspace.css` (+2 / −4): sidebar hint box → inline.
- CSS 5개 추가: composer-flow, prompt-builder, prompt-builder-messages,
  provider-controls (각 1–3줄 조정).

Before → After 요약:
- `.settings-row` border/bg/radius card → `padding: 14px 2px` flat row.
- `.quota-card` surface-2 → flat + divider.
- Provider card만 유일한 card 계층 → "Providers만 card, 나머지는 divider rows".

### Settings polish chain (026 → 030 사이 3커밋)

Phase 026 완료 후, 030(NavRail) 진입 전에 Settings 내부를 추가 정리한 연속 polish.

#### 027: Usage quota → provider card 통합

커밋: `48a110c` | 6 files | +77 / −70

- MODIFY `ui/src/components/settings/QuotaCard.tsx` (+67 / −64): 독립 quota section →
  각 provider card 내부에 quota 표시를 inline으로 병합.
- MODIFY `ui/src/components/AccountSettings.tsx` (+4): provider card에 quota 슬롯 추가.
- MODIFY `ui/src/components/SettingsWorkspace.tsx` (−2): 독립 quota section render 제거.
- MODIFY `ui/src/styles/quota-card.css` (+3 / −3): inline quota 스타일.

#### 028: Provider card 라인 축약

커밋: `3e71bd5` | 3 files | +21 / −37

- MODIFY `ui/src/components/settings/QuotaCard.tsx` (+10 / −26): multi-line → single-line
  condensed row. 라벨과 값을 같은 줄에 배치.
- MODIFY `ui/src/i18n/en.json` (+3 / −3), `ko.json` (+3 / −3): 축약형 레이블.

#### 029: Minimal settings chrome + one-line provider heads

커밋: `fb5af2d` | 6 files | +67 / −27

- MODIFY `ui/src/components/AccountSettings.tsx` (+32 / −4): provider card 헤더를
  SVG 아이콘 + 이름 + 상태 chip의 one-line 구조로 재편.
- MODIFY `ui/src/components/SettingsWorkspace.tsx` (+4 / −7): settings chrome 최소화.
- MODIFY `ui/src/styles/settings-controls.css` (+19 / −2): one-line provider head 스타일.
- MODIFY `ui/src/styles/canvas-viewer.css` (+13 / −9): 연관 viewer 패딩 정리.

Before → After 요약 (3커밋 통합):
- 독립 quota section + multi-line provider card → provider card 내부 single-line quota.
- provider card header: 확장형 multi-line → SVG + name + chip one-line.
- Settings 전체 chrome: heading/wrapper 과다 → 최소 구조.

### Phase 030 — NavRail + hash routing

커밋: `2b552d5` | +269 / −0 (핵심 2개 파일)

전역 navigation shell 도입.

핵심 변경:

- NEW `ui/src/components/NavRail.tsx` (+182): 선언형 `RAIL_ITEMS` 배열, hash resolver,
  SVG 아이콘, desktop 52px rail / mobile safe-area bottom bar.
  hash mapping: `#create`/`#canvas` → classic, `#node` → node, `#agent` → agent,
  `#settings` → overlay. feature flag 준수.
- NEW `ui/src/styles/nav-rail.css` (+87): rail/bar 전환, 활성/hover 상태, breakpoint.
- MODIFY 기타 (26 files total): structure docs, tests, AccountSettings provider card
  quota 통합, UIModeSwitch 삭제(−58), 설정 chrome 정리.

Before → After 요약:
- workspace 전환/설정 진입이 화면 내부에 흩어짐 → NavRail 한곳에서 담당.
- 앱 내부 상태만 → URL hash와 Zustand 양방향 동기화.
- Settings는 `UIMode`가 아닌 overlay `settingsAction`으로 분리.

### Phase 031 — 중복 설정 버튼 제거

커밋: `6be0d4b` | 1 file | +0 / −2

- MODIFY `ui/src/components/Sidebar.tsx` (−2): `SettingsButton` import/render 제거.
  030에서 NavRail에 설정이 전역 목적지로 승격되었으므로 Sidebar 중복 진입점 정리.

### Phase 040 — 갤러리 체이닝 + lazy tile

커밋: `4ca3d55` | 8 files | +415 / −24

갤러리를 "결과 소비 화면"에서 "다음 작업의 출발점"으로 전환.

핵심 변경:

- NEW `ui/src/lib/resultChaining.ts` (+116): 공용 action registry.
  4개 chaining action: `animate`(non-video → 영상화), `edit`(canvas 편집),
  `useAsRef`(fetch→Blob→File 참조 추가), `rebake`(composer 문맥 복원).
  각 action에 `available(item)` predicate, 성공/실패 toast 자체 처리.
- NEW `ui/src/components/GalleryImageTile.tsx` (+78): item별 icon overlay.
- MODIFY `ui/src/components/GalleryModal.tsx` (+56): `useLazyGalleryTiles` hook.
  `IntersectionObserver` placeholder→tile, `rootMargin: "200% 0px"`,
  `visibleKeys` 유지, 미지원 환경 fallback.
- MODIFY `ui/src/components/HistoryStrip.tsx` (+97 / −24): virtualization 적용.
- MODIFY `ui/src/styles/gallery-modal.css` (+72): overlay 스타일.

Before → After 요약:
- 후속 동작 분산 → `CHAINING_ACTIONS` 공용 모델.
- 모든 item 즉시 DOM → IntersectionObserver lazy tile.

### Phase 050 — Assets Library

3개 sub-commit으로 구성.

#### 050-A: Server foundation (`45ba1ee` | 11 files | +937 / −10)

- NEW `lib/assetsStore.ts` (+427): SQLite asset/folder/tag CRUD.
  DB v6, 3 테이블, cursor pagination, kind 제한, 입력 제한.
- NEW `routes/assets.ts` (+203): REST endpoints (`GET/POST /api/assets`,
  `PATCH/DELETE /api/assets/:id`, folders, tags). generated-path 보안 검증.
- MODIFY `lib/db.ts` (+40 / −3): schema v5→v6.
- NEW `tests/assets-store-contract.test.ts` (+115), `tests/assets-routes-contract.test.ts` (+118).

#### 050-B: UI workspace (`0a95636` | 26 files | +640 / −13)

- NEW `ui/src/components/assets/AssetsWorkspace.tsx` (+36): folder tree + toolbar + filters.
- NEW `ui/src/components/assets/AssetsFolderTree.tsx` (+93): 계층 folder 탐색/CRUD.
- NEW `ui/src/components/assets/AssetsGrid.tsx` (+81): `@tanstack/react-virtual` row virtualization.
- NEW `ui/src/lib/api-assets.ts` (+61): API client.
- NEW `ui/src/store/storeAssetsImpl.ts` (+82): 10개 load/CRUD action slice.
- NEW `ui/src/styles/assets-workspace.css` (+62).
- MODIFY `ui/src/lib/resultChaining.ts` (+16 / −1): `saveToAssets` 5번째 chaining action.
- MODIFY NavRail/App/store/i18n 등 연결 파일.

#### 050-C: 최종 리뷰 수정 (`cbcf9e6` | 8 files | +146 / −8)

- MODIFY `storeAssetsImpl.ts` (+12 / −3): monotonic request generation (filter race guard),
  첫 save reconciliation, filter 적합성 검사.
- MODIFY `routes/assets.ts` (+2 / −2): `lstatSync().isFile()` directory rejection.
- NEW `tests/assets-ui-store-contract.test.ts` (+117): stale response/첫 save/filter 계약.

### 전환 흐름 (010 → 050)

Phase 010~050의 진행은 네 겹으로 정리된다.

1. **토큰/브랜드 기반 (010):** 다중 테마를 폐기하고 사이트 디자인 언어를 앱에 이식.
2. **컨트롤 킷 기반 (020):** 새 visual identity 위에서 UI control vocabulary를 4개
   primitive로 통합. 이후 모든 phase가 이 킷을 재사용.
3. **정보구조 + 접근성 (025 → 026 → 027~029):** 통합 킷으로 Settings IA를 6→3으로
   재편하고, contrast 보정, 박스 제거, quota 병합, provider head 축약까지 연속 polish.
4. **기능 계층 (030 → 040 → 050):** NavRail로 전역 shell을 세우고(030), 갤러리를
   chaining 허브로 전환하고(040), Assets 저장 계층을 구축(050).

핵심 원칙: 디자인 변경은 기능 추가 앞에, 기능이 디자인을 요구하면
그 지점에서만 디자인을 앞당긴다. 050까지 순수 디자인(010~029)이 앞서고,
구조(030)와 UX(040)가 이어지고, 기능(050)이 마지막에 오는 것은 이 원칙의 결과.

### 완료 phases 누적 통계

| Phase | Commits | Files | +lines | −lines | 성격 |
|-------|---------|-------|--------|--------|------|
| 010 | 1 | 26 | 170 | 761 | 디자인 |
| 020 | 1 | 19 | 631 | 119 | 디자인 |
| 025 | 1 | 16 | 188 | 221 | 디자인·IA |
| 026 | 1 | 9 | 33 | 37 | 디자인 |
| 027~029 | 3 | 15 | 165 | 134 | 디자인·polish |
| 030+031 | 2 | 27 | 269 | 2 | 구조·IA |
| 040 | 1 | 8 | 415 | 24 | UX |
| 050 | 3 | 45 | 1723 | 31 | 기능 |
| 060 | ~14 | ~30 | ~1500 | ~200 | 기능 |
| **합계** | **~27** | **~130** | **+5094** | **−1529** | |

Phase 060은 별도 구현 세션에서 완료. 잔여: `generatePipeline.ts`의 presetIds→XMP
meta 전파 1건 (WP-1에서 closeout). 상세: `060_home-presets.md` 현재 코드 상태 참조.

---

## Part II — 예정 (070–090)

> Phase 060은 구현 완료 — Part I 누적 통계에 포함. closeout 잔여 1건은 WP-1에서 처리.
> 상세: `060_home-presets.md` 현재 코드 상태 참조.
> stale path 정정: 계획상 `presetCatalog.ts` → 실제 `presets.ts`, `storeGenerateImpl.ts` → 실제 `storeGenImpl.ts`.

### Phase 070 — @멘션 영속 요소

스펙: `005_reference-assets.md` | 성격: 기능 | 의존: 050 Assets, 020 Chip

#### Server

| Op | File | 내용 | est |
|----|------|------|-----|
| NEW | `lib/elementCompiler.ts` | element ID → notes 컴파일 + refs 슬롯 변환 + 상한 | +120 |
| MODIFY | `lib/assetsStore.ts` | element kind payload 검증 (name/kind/refs 1-6/notes) | +60 |
| MODIFY | `routes/assets.ts` | element CRUD + "요소로 저장" + 테스트 시트 | +95 |
| MODIFY | `lib/imageMetadata.ts` | XMP `elementIds: string[]` | +13 |
| MODIFY | `lib/generatePipeline.ts` | element compiler 선적용 | +17 |

#### Frontend

| Op | File | 내용 | est |
|----|------|------|-----|
| NEW | `ui/src/components/ElementMentionMenu.tsx` | `@` 감지 자동완성 | +130 |
| NEW | `ui/src/components/ElementMentionChip.tsx` | mention pill | +55 |
| NEW | `ui/src/components/assets/ElementDetail.tsx` | 요소 상세/편집, 1-6 refs | +180 |
| MODIFY | `ui/src/components/PromptComposer.tsx` | caret `@query` → mention chip | +55 |
| MODIFY | `ui/src/components/assets/AssetsWorkspace.tsx` | master/detail | +30 |
| MODIFY | `ui/src/store/storeAssetsImpl.ts` | element CRUD + promote | +52 |

#### Tests: NEW `tests/element-compiler.test.ts` (+180), NEW `tests/element-metadata.test.ts` (+70)

Done 기준: element CRUD round-trip + compiler 상한/중복 제거 계약 pass.
GPT/Gemini/Grok에서 동일 캐릭터 요소 사용, 수동 일관성 검수 1회 → `assets/070/`.
060의 `presetIds` + 070의 `elementIds`가 XMP에서 공존하는 왕복 테스트 필수.
050의 `assetsStore`가 element kind를 올바르게 필터/검색하는 계약 확장.

### Phase 080 — 노드 템플릿/팔레트 + 비디오 모션/extend

스펙: `006`, `007` | 성격: UX·기능

#### Node templates + palette

| Op | File | 내용 | est |
|----|------|------|-----|
| NEW | `lib/nodeTemplateStore.ts` | template CRUD, strip, seed 4-6개 | +180 |
| NEW | `ui/src/components/node-canvas/NodeCanvasEmptyState.tsx` | 빈 캔버스 3택 | +140 |
| NEW | `ui/src/components/node-canvas/NodeTemplatePicker.tsx` | template 목록 | +130 |
| NEW | `ui/src/components/node-canvas/NodeCommandPalette.tsx` | `/` 검색 삽입기 | +170 |
| NEW | `ui/src/lib/nodeCompatibility.ts` | port type 호환 매트릭스 | +90 |
| NEW | `ui/src/lib/nodeBranching.ts` | 2-4개 병렬 분기 transform | +100 |
| NEW | `ui/src/components/node-canvas/ElementReferenceNode.tsx` | 070 요소 참조 노드 | +110 |

#### Video motion + extend

| Op | File | 내용 | est |
|----|------|------|-----|
| NEW | `lib/videoMotionPresets.ts` | motion preset, provider fragments, 배타 그룹 | +100 |
| NEW | `ui/src/lib/videoMotionSelection.ts` | chip toggle, 상한, 충돌 차단 | +70 |
| MODIFY | `routes/videoExtended.ts` | continue-from-last-frame orchestration | +70 |
| MODIFY | `ui/src/components/VideoControlsPanel.tsx` | motion chip row | +55 |
| MODIFY | `ui/src/components/ResultActions.tsx` | video "이어가기" | +30 |

#### Tests: NEW `tests/node-template-contract.test.ts` (+170), `tests/node-compatibility.test.ts` (+130), `tests/video-motion-presets.test.ts` (+120)

보류: ffmpeg concat MP4 내보내기, 동기 compare view → 090 원장.

Done 기준:
- node template save→restore round-trip + strip 검증(media/results 제거됨).
- port compatibility 매트릭스 전수 테스트.
- video motion chip 선택 상한/배타 그룹 계약.
- video extend: last-frame extraction→I2V injection + parentId lineage 계약.
- 100+ node 그래프에서 pan/zoom 프로파일 허용 기준 충족 → `assets/080/`.

Phase 080은 이 레인에서 가장 넓은 범위의 기능 phase. Node templates/palette/branching과
video motion/extend가 독립적이므로 두 트랙을 병렬 진행 가능. 단, ElementReferenceNode는
070 완료 후에만 의미가 있으므로 요소 참조 노드만 070 이후에 배치.

### Phase 090 — Closeout + 미결정 원장

별도 구현 범위 없음. 매 phase 공통 게이트 (typecheck / test / build green),
스크린샷, 500줄/50줄 컨벤션 확인. 010–080 done → `_fin/260712_` 이동.

게이트 체크리스트:
- `npm run typecheck` + `npm run typecheck:tests`: exit 0.
- `npm test`: 전체 pass, 0 fail.
- `npm run test:inventory`: 등록 완전성.
- `cd ui && npm run build`: Vite production build exit 0.
- 다크 × 데스크톱(1280×720) / 모바일(390×844) 스크린샷 → `assets/<phase>/`.
- 파일 500줄 / 함수 50줄 컨벤션 위반 없음.
- `260711_production-hardening` 레인과 충돌 확인 — `ui/src/components/agent/*` 불가침.

미결정 원장: 리니지 뷰, Generate 비용 병기, 홈 기본 진입,
ffmpeg concat, 동기 compare, MCP 서버, 립싱크/TTS.

해소된 항목:
- 라이트 테마 유지 범위 → **다크 단일** (2026-07-12, Phase 010 편입).
- Assets 저장 형식 → **SQLite** (2026-07-13, Phase 050 스파이크 결정).
