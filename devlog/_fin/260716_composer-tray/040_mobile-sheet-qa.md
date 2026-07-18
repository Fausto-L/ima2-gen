# 040 — 모바일 시트 적용 + 통합 QA

> **감사 R1 반영 (Darwin FAIL → 수정):**
>
> **D1. 명칭 정정.** 인라인 재사용은 030 C1대로 `InFlightList variant="inline"` + disclosure 셸(`InFlightPanel` 컴포넌트는 존재하지 않음). `panelId` prop으로 aria-controls 연결.
>
> **D2. Home 표면 정책 확정.** HomePromptComposer는 전역 prompt+generate를 쓰므로 숨은 트레이 참조가 몰래 전송될 수 있음 → Home에는 **읽기 전용 미니 트레이 스트립**(썸네일+카운트, 제거는 Create 화면 유도)을 표시해 가시성만 보장한다. 트레이 편집 UI 전체는 Create 전용.
>
> **D3.** 020 B4에 따라 70% 규칙은 데스크톱 미디어쿼리 안 — 040 이전에 모바일이 깨지는 일 없음(020 수용 기준에 모바일 스모크 포함).

선행: 010/020/030. 목업: Mockup D. 시트는 기존 86dvh 유지(70% 규칙은 데스크톱 전용 — 인터뷰 U5).

## Diff-level 변경

### 1. ui/src/components/MobileComposeSheet.tsx
- Prompt 탭 구조: 트레이(020 ReferenceTray 재사용, 슬롯 64px로 확대) → 대형 textarea(시트 가용높이 flex-grow, min 160px) → 스티키 하단 행(Generate + 인플라이트 배지).
- 배지 탭 = 시트 내 인라인 `INFLIGHT (n)` 접이식 스택 토글(`InFlightList variant="inline"` + disclosure 셸 재사용). hover 경로는 모바일에서 비활성.
- 시트 내 InFlightList 기존 배치는 인라인 스택으로 대체.
- 모바일 앱바가 유일한 생성 진입점이므로 desktop `.sidebar`는 `data-mobile="1"`에서 숨겨 터치 가로채기와 중복 컴포저를 제거한다.

### 2. ui/src/styles/responsive-layout.css
- 시트 내부를 `display:flex; flex-direction:column`으로, 트레이/툴바 고정·textarea flex-grow. 스티키 Generate 행 `position:sticky; bottom:0`; 기존 시트 safe-area padding을 유지한다. 세로 스크롤 소유자는 `.compose-sheet__body` 하나뿐이다.
- 죽은태그 mirror는 020 구현 그대로 동작(동일 컴포넌트) — 모바일 폰트 크기 변화에 mirror가 computed style 복제로 자동 추종하는지 QA.

### 3. 터치 타깃
- 슬롯 X 최소 44px hit(가상 padding), 배지 44px, 접이식 헤더 44px.
- 레이어 순서는 앱바 150 < 모바일 NavRail 160 < backdrop 170 < compose sheet 180 < 멘션 메뉴 220으로 고정해 하단 내비가 시트 액션을 가로채지 않게 한다.

## 통합 QA 매트릭스 (c4)

| 시나리오 | 데스크톱 1440×900 | 모바일 390×844 |
|----------|------------------|----------------|
| 첨부 2 + 멘션 1 → 카운트 3/limit | ✓ 스크린샷 | ✓ 스크린샷 |
| 트레이 X → 죽은태그 회색 | ✓ | ✓ |
| grok 이미지 한도 3 초과 시도 → + 슬롯 비활성 | ✓ | ✓ |
| MCP 레인 첨부 → temp 업로드 → references 전송 | ✓ (모의 provider) | — |
| 배지 hover(데스크톱)/탭(모바일) → 팝업/스택 | ✓ 우측 팝업 | ✓ 인라인 스택 |
| 진행 중 취소 X | ✓ | ✓ |
| 멘션 메뉴가 트레이/오버레이 위 z-order 정상 | ✓ | ✓ (z220) |

검증 커맨드: npm run typecheck, node --test (composer/tray/inflight 계약), cd ui && npm run build, agbrowse 스크린샷 세트 → evidence/.

## Out of scope

- AssetGen composer 파생 표면은 후속이다. HomePromptComposer는 감사 D2에 따라 읽기 전용 미니 트레이 스트립까지만 이번 범위에 포함한다.

## 2026-07-16 구현·QA 기록

- 모바일 Prompt 탭에 통합 트레이, 대형 textarea, 스티키 Generate+인플라이트 배지, 인라인 `InFlightList`를 연결했다. Prompt 탭 이탈·시트 종료·0건 전환 때 펼침 상태를 초기화하고, 마지막 작업이 사라질 때 패널 안 포커스를 배지로 복귀시킨다.
- HomePromptComposer에는 전역 트레이의 읽기 전용 썸네일+카운트 스트립을 추가했다. Home에서 참조를 편집하지는 않는다.
- 브라우저 QA에서 desktop sidebar가 모바일 앱바 터치를 가로채는 문제를 발견해 `data-mobile="1"`에서 숨겼다. 모바일 NavRail(z200)이 compose sheet(z180)를 덮는 문제도 확인해 z160으로 내려 `appbar 150 < nav 160 < backdrop 170 < sheet 180 < mention 220` 순서를 고정했다.
- 중첩 스크롤을 제거해 `.compose-sheet__body`만 세로 스크롤을 소유한다. 320px에서 트레이 삭제 버튼의 실제 hit box는 브라우저 배율 오차를 포함해 43.98×43.98px(의도값 44px)였다.
- 계약 테스트: `node --test tests/mobile-composer-tray-contract.test.js tests/mobile-generate-entry-contract.test.js tests/inflight-badge-popup-contract.test.js tests/composer-tray-ui-contract.test.js` → 18/18 pass.
- 정적·빌드: `npm run typecheck`, `npm run typecheck:tests`, `cd ui && npx tsc --noEmit && npm run build` → 모두 exit 0. 기존 Vite dynamic/static import 및 500kB chunk 경고만 남고 실패는 없다.
- 실제 브라우저: `node devlog/_plan/260716_composer-tray/wp4-browser-qa.mjs` → 390×844/320×844, 첨부 2+@Jipy, 죽은 태그, 인라인 인플라이트, 탭 reset, Home 미니 트레이, 콘솔 오류 0 확인.
- 증거: `evidence-040-mobile-tray.png`, `evidence-040-mobile-deadtag.png`, `evidence-040-mobile-inflight.png`, `evidence-040-mobile-320.png`, `evidence-040-home-reference-strip.png`.
- C 리뷰 repair: 누락됐던 `ui/src/styles/inflight-tray.css`를 커밋 범위에 포함해 clean checkout 재현성을 회복했다. 마지막 inflight 제거 시 패널 포커스는 남아 있는 Generate로 이동하고, 수동 collapse는 badge로 복귀한다. 탭·시트·viewport·settings·mode 전환 모두 expanded 상태를 초기화한다.
- 모바일 탭·앱바·컴포저 도구를 44px 타깃으로 통일했다. dead tag는 인터뷰 결정대로 중립 회색+취소선으로 바꾸고, 단일 text node + `Range.getClientRects()` 오버레이로 320px 줄바꿈 좌표 밀림을 제거했다.
- 추가 증거: `evidence-040-mobile-ko.png`에서 한국어 Prompt/Options/Library/참조/이어가기/저장/스토리보드/생성 라벨이 390×844에서 잘리지 않는 것을 확인했다. 브라우저 자동화는 격리된 Chrome 1x context를 열고 종료하므로 기존 사용자 세션·과금 호출을 건드리지 않는다.
- clean archive 재현: `git archive HEAD`에서 composer/tray/inflight 계약 18/18은 통과했다. 전역 root/UI typecheck는 wp4 밖 기존 HEAD가 아직 커밋되지 않은 asset-gen/backend 파일(`assetDerived`, `videoKeying`, `backgroundPresets`, `elementCompiler`, `AssetGenProjectRail` 등)을 import하는 병행 상태라 실패했다. 현재 워킹트리에서는 해당 병행 파일이 있어 root/typecheck:tests/UI build가 모두 exit 0이며, 이 out-of-slice 결함은 wp4 커밋에 섞지 않았다.
