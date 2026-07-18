# 020 — 데스크톱 대형 컴포저 레이아웃 + 죽은 태그 오버레이

> **감사 R1 반영 (Darwin FAIL → 수정):**
>
> **B1. 죽은 태그 조인 키는 tag(010 A2 tombstone).** "tokenId 맵" 표현 정정 — `findDeadTags(prompt, retiredTags)`는 tombstone에 있는 tag만 dead로 표시한다. 미등록 @word(이메일·핸들)는 손대지 않는다. 토큰 경계 로직은 elementMention.ts의 private mentionCharacter를 export로 승격해 재사용.
>
> **B2. 오버레이 렌더 전략 확정 — "하이라이터" 방식.** 투명 mirror 위 회색 글자는 textarea 본문 글리프와 겹쳐 효과가 없다는 지적 수용. 확정 방식: mirror를 textarea **뒤**(z-index 낮음)에 두고, 죽은 태그 span에만 `배경 하이라이트(어두운 red-tint pill) + 취소선`을 그린다. textarea 글자는 그대로 위에 렌더되고 하이라이트가 배경으로 비친다(글자색 변경은 포기 — textarea에서 부분 글자색은 불가능하며 contenteditable 마이그레이션은 명시적 non-goal). 캐럿/선택 동작은 native textarea 그대로. 스크롤/리사이즈 동기화: onScroll + ResizeObserver.
>
> **B3. 레이아웃 오너 정정.** `.sidebar`는 grid가 아니라 **flex column**(sidebar.css:2). 70% 규칙은 `.sidebar__scroll` 내 컴포저 래퍼에 `flex: 7 1 0` / 나머지 콘텐츠 `flex: 3 1 0` + textarea `flex-grow` 로 구현.
>
> **B4. 모바일 격리.** 모바일 시트는 PromptComposer를 default variant로 마운트(MobileComposeSheet.tsx:87)하므로, 70% 높이 규칙은 반드시 `@media (min-width: 801px)` 안에서만 적용해 040 이전에 모바일이 깨지지 않게 한다.
>
> **B5. 인용 정정.** element 썸네일 패턴은 McpGenerationControls가 아니라 **PromptComposer의 GenerationControls 경로가 아닌 `/generated/` URL 조립 방식**(PromptComposer.tsx:366-371의 thumbnail 조립)을 따른다.

선행: 010(TrayItem 상태모델). 목업: Mockup A(기본), B(죽은 태그).

## 목표 상태

사이드바 컴포저가 패널 높이 ~70%를 차지하는 대형 프롬프트 창. 위→아래:
`PROMPT 라벨+카운트(N+M/limit)` → `참조 슬롯 트레이(56px 썸네일+@태그+X, + 슬롯)` → `대형 textarea(죽은태그 회색)` → `툴바(Continue/비디오/Direct/검색/Save/Storyboard)` → `Generate + 인플라이트 배지(030)`.

## Diff-level 변경

### 1. ui/src/styles/progress-composer.css
- `--composer-textarea-min-height: 80px; --composer-textarea-max-height: 218px;` (현재 201-202행 부근) →
  사이드바 variant에서 `--composer-textarea-min-height: clamp(200px, 42vh, 520px); --composer-textarea-max-height: none;`
  컴포저 루트를 `display:flex; flex-direction:column; min-height: 70%` 계열로 — 정확히는 `.sidebar` grid에서 composer row를 `minmax(0, 7fr)`, 갤러리/기타 row를 `minmax(0, 3fr)`로 재배분. 사이드바 grid 정의는 ui/src/styles/sidebar.css의 `.sidebar` 레이아웃 확인 후 조정(스크롤은 textarea 내부로).
- 신규 `.composer__tray` 슬롯 스타일: `display:flex; gap:8px; flex-wrap:wrap;` 슬롯 `.composer__tray-slot { width:56px; }` 썸네일 48px 정사각 + 라벨(태그, 11px mono, ellipsis) + X(hit 24px). `+` 슬롯은 dashed border. 기존 `.composer__chips`(344행 부근)는 트레이로 대체·삭제.
- 죽은 태그 오버레이용 `.composer__prompt-stack { position:relative }`, `.composer__prompt-mirror { position:absolute; inset:0; pointer-events:none; color:transparent; }` mirror 안 `.dead-tag { color: var(--text-dim); text-decoration: line-through; }` — textarea와 동일 font/padding/line-height/wrap (ElementMentionMenu.getCaretRect의 속성 복제 목록 재사용).

### 2. ui/src/components/PromptComposer.tsx
- `composer__chips`(refs.map 썸네일)와 `Selected elements` ChipRow(349행 부근)를 제거하고 단일 `<ReferenceTray items={trayItems} onRemove onAdd />` 렌더 (010의 스토어 셀렉터 사용).
- textarea를 `composer__prompt-stack`으로 감싸고 뒤에 mirror div 렌더. mirror 내용 = 프롬프트를 태그 경계로 split, 살아있는 태그·일반 텍스트는 transparent span, 죽은 태그(트레이 tokenId 맵에 없는 @word)는 `.dead-tag` span. 스크롤 동기화: textarea onScroll → mirror.scrollTop.
- 죽은 태그 판정: `findDeadTags(prompt, trayTags)` 순수 함수 (010의 tokenId↔tag 맵). `@` 뒤 `[\p{L}\p{N}_-]+` 토큰 스캔 — elementMention.ts의 mentionCharacter 재사용.
- 카운트 라벨: 기존 `prompt.refCount` i18n 재사용하되 count=N+M.

### 3. 신규 ui/src/components/composer/ReferenceTray.tsx (~120줄)
- props: items(TrayItem[]), limit, onRemove(tokenId), onAdd(). 썸네일: attachment는 dataUrl, element는 `/generated/` 경로(기존 McpGenerationControls 썸네일 패턴). aria: 리스트+항목 라벨 "@tag, 참조 n/limit".

### 4. i18n
- `prompt.trayAria`, `prompt.deadTagHint`("트레이에서 제거된 태그 — 참조로만 표시"), en/ko.

## 수용 기준 (c2)

- 1440×900에서 컴포저가 사이드바 높이 65-75% 점유(스크린샷 측정), 트레이+대형 입력이 Mockup A 구조와 일치.
- 트레이 X 클릭 → 슬롯 제거 + 프롬프트 @태그가 즉시 회색/취소선(Mockup B), payload 텍스트 불변(계약 테스트).
- mirror 정렬: 긴 멀티라인 프롬프트에서 죽은 태그 위치 오차 없음(스크롤 포함, 수동 QA + 스크린샷).
- typecheck/ui build/기존 composer 계약 테스트 통과(카운트 어서션은 010에서 갱신).

## Out of scope

- 인플라이트 배지/팝업(030), 모바일 시트(040), 멘션 메뉴 스타일 변경.
