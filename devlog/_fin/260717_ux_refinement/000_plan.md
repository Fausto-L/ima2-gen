---
created: 2026-07-17
tags: [ima2-gen, ux, roadmap, devlog]
---

# 260717 UX Refinement — 000 Plan (roadmap cycle)

## Loop spec

- Archetype: spec-satisfaction (docs-first multi-cycle; 이 사이클은 docs-only Phase-0).
- Trigger: 사용자 요청 — 최근 커밋들이 만든 표면의 UX 전반 개선, Higgsfield/Runway 벤치마크 실사 병행.
- Goal: 최근 커밋 표면(컴포저 트레이, 인플라이트, 모바일 시트, MCP 셀렉터/설정, Assets/Element Library)의 마감 품질을 벤치마크 수준으로 끌어올리는 diff-level 로드맵을 잠그고, 이후 사이클에서 decade doc당 1 PABCD로 구현한다.
- Non-goals: 새 provider/과금/API 계약, `ui/src/components/agent/*`(260711 불가침), 병렬 미커밋 126파일이 소유한 표면(star/favorite, element-mention WT, node-canvas, video-motion, asset-gen rail, `mcpProviders.ts`, `right-panel.css`, `storeTypes.ts`, `useAppStore.ts`, `App.tsx`, `NavRail.tsx`) 직접 수정.
- Verifier: 각 구현 C에서 `npm run typecheck` + `typecheck:tests` + `npm test` + `cd ui && npm run build` + 브라우저 render-grounding 관찰. 이 docs 사이클의 C는 문서-대-저장소 정합 검증(경로/라인 앵커 실재, LEXICO 네이밍, 의존 순서).
- Stop: goalplan workPhases가 decade docs와 1:1로 잠기고 A 감사 pass.
- Memory: 이 유닛 + `.codexclaw/goalplans/ima2-gen-ux-hotl-docs-first-multi-cycle-composer/` + `assets/*.png`.
- Terminal: DONE / NEEDS_HUMAN(계약 의미 충돌) / BLOCKED(병렬 작업과 전면 충돌).
- Escalation: reviewer 3회 연속 blocker 미해소 시 P 재계획. 자원: sol high priority 서브에이전트 무제한(사용자 승인), wall-clock 6h.

## 근거 수집 (2026-07-17 실사)

1. **벤치마크 (Chrome, 로그인 세션)** — `001_benchmark_qa_evidence.md` 상세.
   Higgsfield: 모델 피커 = 검색 + Featured 그룹 + 모델별 1줄 설명 + NEW 배지. Assets = 빈 상태에 일러스트+카피+Generate CTA, 좌측 폴더 트리 + 타입 필터 + Favorites 고정 항목. 비디오 폼 = 좌측 고정 패널(미디어 업로드 → 프롬프트 → 모델 → 8s/Auto/1080p 칩 → Generate+크레딧 병기), 3-step 온보딩.
   Runway: 세션 개념 + 상단 Image/Video/Audio 모드 탭. 모델 피커 = 검색 + Recent/Featured/벤더 필터 칩 + 모델명 옆 capability 요약. Duration 칩 → 팝오버 슬라이더(min/max 라벨). Apps 드롭다운 = 썸네일+제목+1줄 설명. Assets = 날짜 그룹 그리드 + All media/Favorites/Tags 필터 + Compact 밀도 토글.
2. **자체 QA (Chrome, 데스크톱 1470px + 모바일 390px)** — 스크린샷 `assets/qa-*.png`.
   - 라이브 결함: 홈 네비 버튼이 raw key `nav.home` 노출(en/ko 모두 `nav.home` 키 부재 — `NavRail.tsx:121`은 참조, i18n엔 없음). Assets 필터바에 raw key `assets.clearAll` 노출(en.json:1764에 flat key로 존재하나 t() 해석 실패 — 원인 조사 필요, ko도 확인).
   - 멘션 메뉴/트레이/갤러리/Element Library/설정 카드 기본 동작은 정상.
3. **코드 감사 (sol explorer, path:line 앵커)** — `002_code_friction_inventory.md` 상세. TOP 22 마찰 후보와 CONFLICT ZONES 목록.

## 병렬 작업 충돌 정책 (STRICT)

`git status` 126 엔트리는 병렬 세션 소유물이다. 이 로드맵의 모든 phase는 **clean 파일만 write scope로 갖는다** (검증: 2026-07-17 09:40 `git status --short <files>` 빈 출력). WT 파일이 소유한 결함(예: `mcpProviders.ts` refresh loading, star 계약, ElementMentionMenu ARIA)은 **구현하지 않고** `090_deferred_ledger.md`에 이월 기록한다.

Dirty-파일 예외 (additive-only, A 감사 blocker #2/#1/#6 반영):

- `ui/src/i18n/en.json`/`ko.json`: **키 추가만**. 파일 끝 dotted-root key(`"assets.clearAll"` 등)는 **삭제하지 않는다** — nested 중복 키를 추가하면 코드는 nested 경로로 해석되고 dotted-root는 무해한 dead data로 남는다. 제거는 JSON 병렬 diff 정리 후 후속 클린업으로 090에 이월.
- `docs/migration/runtime-test-inventory.md`: 생성 산출물. 각 구현 phase는 `node scripts/classify-tests.mjs`로 **로컬 재생성해 게이트만 green으로 유지**하고, 이 파일은 **커밋에 포함하지 않는다**(병렬 테스트 파일이 disk에 있어 재생성본에 섞임). 최종 인벤토리 커밋은 마지막에 랜딩하는 레인 소유 — 090 기록.
- `.gitignore`: 현재 WT 규칙이 `devlog/_plan/*`를 ignore하고 `260715_subscription-mcp-providers`만 예외다. 이 유닛 문서를 커밋 가능하게 하려면 `!devlog/_plan/260717_ux_refinement/` + `!devlog/_plan/260717_ux_refinement/**` 2줄을 **추가만** 한다(병렬 hunk 불변). 로드맵 사이클 D 직전에 수행.

## Phase map (요약 — 정본은 각 decade doc)

| Phase | Doc | 표면 | Write scope 요약 (dirty 예외는 위 정책 참조) |
|---|---|---|---|
| 1 | `010_i18n_raw_key_fixes.md` | raw i18n key 결함 + 하드코드 카피 | `ui/src/i18n/en.json`(+keys only), `ko.json`(+keys only), `ui/src/components/assets/AssetsWorkspace.tsx`, 신규 i18n 계약 테스트 |
| 2 | `020_mobile_sheet_focus.md` | 모바일 컴포저 시트 focus/inert/tabs | `ui/src/components/MobileComposeSheet.tsx`, `ui/src/components/MobileAppBar.tsx`, focus-owner 신규 모듈, `ui/src/styles/responsive-layout.css`, 계약 테스트 |
| 3 | `030_composer_feedback.md` | partial-paste 피드백, dead-tag a11y, focus-visible, PromptComposer 500줄 분할 | `ui/src/components/PromptComposer.tsx`(+분할 신규 파일), `ui/src/components/composer/DeadTagMirror.tsx`, `ui/src/styles/progress-composer.css`, en/ko(+keys only), 기존 composer 테스트 수정 + 신규 테스트 |
| 4 | `040_mcp_settings_states.md` | MCP settings 카탈로그 loading/retry/empty, Select 빈 목록 가드, aria-pressed, Refresh busy(컴포넌트 로컬) | `ui/src/components/settings/McpGenerationControls.tsx`, `settings/McpModelPresetControls.tsx`, `settings/McpProviderConnections.tsx`, `ui/src/components/controls/Select.tsx`, `controls/DurationSlider.tsx`, `ui/src/styles/settings-controls.css`, en/ko(+keys only), 테스트 (`controls.css`는 read-only) |
| 5 | `050_inflight_popup_polish.md` | 인플라이트 팝업 닫기 affordance, progress a11y, z-index 정리 | `ui/src/components/composer/InFlightPopup.tsx`, `ui/src/components/InFlightList.tsx`, `ui/src/styles/inflight-tray.css`, 테스트 (`InFlightBadge.tsx`는 read-only) |
| 6 | `060_assets_workspace_polish.md` | 모바일 폴더 CRUD 복원, rename 중복 제출 가드, 모바일 detail dialog 계약, aria-current, 빈 상태 CTA 보강(벤치마크) | `ui/src/components/assets/AssetsWorkspace.tsx`, `AssetsFolderTree.tsx`, `ui/src/styles/assets-workspace.css`, 테스트 |
| — | `090_deferred_ledger.md` | WT-충돌 이월 + 미결정 | 문서만 |

각 phase의 정본 write scope는 해당 decade doc의 파일 변경 맵이다(위 표는 요약 — 불일치 시 decade doc 우선).

순서 근거(dependency graph, A 감사 blocker #7 반영): 진짜 파일/계약 의존은
`010 → 030/040`(en/ko i18n 키 추가 순서 — 010이 en/ko의 assets/nav 키를 먼저 넣어야 이후 phase가 라인 시프트를 한 번만 재검증), `010 → 060`(AssetsWorkspace.tsx 공동 수정, 060 doc에 라인 시프트 재검증 명시), 그리고 전 phase 공통의 inventory 로컬 재생성 규칙뿐이다. 020/050은 어느 phase와도 파일이 겹치지 않아 독립 실행 가능. 010을 최우선으로 두는 것은 의존 + 라이브 노출 결함이라는 우선순위 판단이고, 020→030→040→050→060의 나머지 순서는 dependency가 아니라 priority order다.

## Accept criteria (roadmap cycle)

- [ ] 000~002 리서치 docs + 010~060 diff-level decade docs + 090 이월 원장 존재, LEXICO 준수.
- [ ] 각 decade doc: 정확한 파일 경로, NEW/MODIFY 구분, before/after 디프 수준 상세, 활성화 시나리오(C-ACTIVATION-GROUNDING-01), 테스트 계획, render-grounding 대상 명시.
- [ ] 모든 write scope가 검증 시점 clean — dirty 예외(en/ko key-add-only, inventory 로컬 재생성, .gitignore 예외 2줄)는 위 정책 조건대로만 (충돌 정책 준수).
- [ ] A 감사 pass/near-pass + goalplan workPhases 1:1 잠금.
