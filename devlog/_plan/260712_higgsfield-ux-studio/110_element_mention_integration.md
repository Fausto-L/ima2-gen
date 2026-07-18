---
created: 2026-07-18
tags: [ima2-gen, phase, elements, mention, ui-contract]
status: planned
---

# Phase 110 — Element Mention UI 통합 + 계약 테스트

Phase 070의 element compiler/metadata/menu 골격은 동작하지만, 선택된 element를
composer에서 실제 chip으로 렌더하는 production 연결과 IME/Escape 안정성, 전용 UI
계약 테스트가 비어 있다. 이 문서는 `070_elements.md:307-375`의 상호작용 규칙과
`:597-612`의 EM-01..EM-12를 현재 코드에 맞춰 닫는 diff-level 구현 단위다.

기준 시점은 2026-07-18이다. `PromptComposer.tsx`는 현재 **446줄**이다. 단일 파일
500줄 제한을 넘기지 않도록 chip 목록 렌더는 별도 소형 컴포넌트로 분리하고,
composer에는 상태 연결·입력 이벤트·선택 처리만 남긴다.

## 루프 스펙 — WP-070-EM

- 아키타입: spec-satisfaction / UI contract closeout.
- 목표: 선택 element의 ordered chip row, IME-safe mention 탐색, Escape sticky-close,
  missing generation gate를 production 경로에 연결하고 EM-01..EM-12를 하나의 계약
  테스트로 고정한다.
- 활성 조건: `070_elements.md`의 mention UI 구현은 존재하지만 chip production render,
  IME/sticky Escape, `tests/element-mention-ui-contract.test.js` 중 하나라도 비어 있다.
- 완료 조건: focused contract test, UI typecheck/build, test inventory가 모두 green이고
  아래 IME/fresh-store/missing/duplicate 활성 시나리오가 코드와 테스트 양쪽에서 닫힌다.
- 중단 조건: server/compiler/provider 계약 변경이 필요하거나 element 선택 모델을
  `trayItems`가 아닌 별도 저장 모델로 바꿔야 할 경우. 해당 범위는 이 단위에서
  확장하지 않고 부모 phase로 반환한다.

## Scope IN / OUT

### IN

- classic composer의 element mention 감지, 선택, ordered chip row, 제거.
- fresh Create workspace에서 global `state.assets`가 비어 있어도 menu의 full
  `AssetItem` snapshot으로 tray 선택을 원자적으로 생성하는 경로.
- IME composition 중 menu update 억제와 composition commit 후 1회 재평가.
- Escape로 닫은 동일 mention range/query의 sticky suppression과 다음 text mutation 해제.
- 삭제된 element의 missing chip 보존 및 모든 classic image/video 진입 전 generation
  차단.
- 현재 `ElementMentionMenu`, `ElementMentionChip`, `element-mention.css`,
  `findMentionAtCaret` 동작을 고정하는 source/pure-helper 계약 테스트.

### OUT

- element CRUD, refs/notes compiler, provider capacity, XMP/sidecar round-trip 재설계.
- node canvas의 `ElementReferenceNode`, Home composer의 별도 mention UX.
- menu visual redesign, 새 animation, 새 dependency, jsdom/browser test harness 도입.
- tray attachment mention parity 변경. `tray:` option은 계속 element option보다 먼저 둔다.
- `070_elements.md`나 기존 테스트/소스의 동시 수정. 이 문서 구현 시점에 별도 diff로
  진행한다.

## 재검증된 현재 상태

| 영역 | 현재 근거 | 판정 |
|---|---|---|
| parser | `ui/src/lib/elementMention.ts:16-37` | 문자/숫자/한글/`_`/`-`, 경계, email 배제, newline 차단이 이미 순수 함수로 구현됨 |
| menu order/filter | `ui/src/components/ElementMentionMenu.tsx:73-77` | 빈 query는 입력 배열 순서를 유지하고 name+tags를 locale lowercase로 필터함 |
| keyboard/a11y | `ElementMentionMenu.tsx:93-120` | wrap/Home/End/Enter/Tab/Escape, listbox/option, active descendant, empty state 존재 |
| positioning | `ElementMentionMenu.tsx:34-65,82-90,114-124` | textarea mirror, top/bottom, clamp, rAF scroll/resize, portal, mobile class 존재 |
| chip primitive | `ui/src/components/ElementMentionChip.tsx:32-46` | thumbnail/name/kind, 독립 remove accessible name, missing warning 상태 존재 |
| composer wiring | `ui/src/components/PromptComposer.tsx:351-355,364-414` | onChange/onClick마다 parser 실행, 선택 시 ID 추가·range 치환·menu close |
| production chip gap | `PromptComposer.tsx:9-10,330-342` | menu는 value import지만 chip은 type-only import이며 preset chip만 실제 렌더됨 |
| selection state | `ui/src/store/storeReferenceImpl.ts:252-283,319-324` | element ID 중복 방지와 ID 기반 제거가 tray 단일 writer 안에 존재 |
| fresh-store blocker | `PromptComposer.tsx:50-59,381-402` + `storeReferenceImpl.ts:259-264` | menu는 local `elements`로 열리지만 writer는 global `state.assets`만 조회하므로 fresh Create의 빈 store에서 선택이 `null`로 끝남 |
| recent order | `lib/assetsStore.ts:351-358` | element 목록의 기반 정렬은 `created_at DESC, id DESC` |
| CSS | `ui/src/styles/element-mention.css:1-36` | menu/chip/missing/mobile bottom-sheet 스타일 존재 |
| contract test | `tests/element-mention-ui-contract.test.js` | 파일 없음 |

### 앵커 교정

- chip type import는 `PromptComposer.tsx:9`가 아니라 **`:10`**이다. `:9`는
  `ElementMentionMenu` value import다.
- composer의 현재 line count는 **446**이다. 500줄을 이미 넘은 상태는 아니지만,
  IME/sticky state와 chip row를 모두 inline으로 넣으면 한계에 근접하므로 row를
  `composer/ElementMentionChips.tsx`로 분리한다.
- dedupe의 mutation 시작은 `storeReferenceImpl.ts:257`이고 실제 duplicate predicate는
  **`:259-260`**이다. 제거 함수는 `:319-324`다.
- 선택 wiring은 `PromptComposer.tsx:392-414`, 입력 갱신은 `:351-355`다.
- B1 핵심은 `storeReferenceImpl.ts:262-264`다. local menu가 가진 full asset record가
  writer로 전달되지 않아 `state.assets=[]`이면 requested tag와 tray item을 만들지 못한다.

## Before → After

### 상태 흐름

Before:

```text
textarea onChange/onClick
  -> findMentionAtCaret
  -> menu
  -> local elements에는 option이 보임
  -> addElementId(id)
  -> writer는 global state.assets에서만 id 조회
  -> fresh Create(state.assets=[])에서는 null/no-op, range 치환과 chip 모두 없음

IME composing change도 매번 parser 실행
Escape -> menu close -> 같은 caret click에서 즉시 다시 열림
missing ID -> provider 요청 전 UI 차단 없음
```

After:

```text
textarea mutation
  -> Escape suppression 해제
  -> composing이면 menu update 생략
  -> compositionend에서 committed value/caret 1회 평가
  -> query key(range + query)가 suppressed key와 다를 때만 menu open

select
  -> composer가 local elements에서 selected AssetItem을 찾음
  -> addElementFromMention(selectedAsset)로 full record 전달
  -> tray 단일 writer가 elementCatalog에 record를 ID upsert
  -> 같은 mutation에서 stable element ID dedupe + tray item 생성
  -> 현재 @query range만 @tag + space로 치환
  -> menu close
  -> tray 선택 순서대로 ElementMentionChips 렌더

full-record catalog sync
  -> loadAllElementAssets 성공 시 AssetItem[] 전체를 elementCatalog에 replace
  -> 선택 ID 중 catalog에 없는 ID를 missingElementIds로 materialize
  -> missing chip 유지
  -> GenerateButton disabled + generate entry early return
```

### 렌더 구조

Before:

```tsx
<ChipRow ariaLabel="Selected presets">...</ChipRow>
<div className="composer__prompt-stack">
  <textarea ... />
</div>
```

After:

```tsx
<ChipRow ariaLabel="Selected presets">...</ChipRow>
<ElementMentionChips
  items={selectedElementItems}
  assets={elementCatalog ?? []}
  missingElementIds={missingElementIds}
  onRemove={removeElementId}
/>
<div className="composer__prompt-stack">
  <textarea
    onCompositionStart={...}
    onCompositionEnd={...}
    onChange={...}
    onClick={...}
    onKeyDown={...}
  />
</div>
```

chip row는 textarea 바깥, preset row와 prompt stack 사이에 둔다. DOM 순서와
`trayItems`의 element 순서를 동일하게 유지한다.

## 정확한 파일 맵

| Op | 경로 | diff-level 책임 | 예상 순증감 |
|---|---|---|---:|
| NEW | `ui/src/components/composer/ElementMentionChips.tsx` | element tray item을 선택 순서대로 `ElementMentionChip`에 투영한다. live full-record catalog가 있으면 현재 thumbnail/name/kind를 쓰고, 없으면 `nameAtInsertion`과 `missing` 상태를 보존한다. executable test가 같은 projection을 실행하도록 `buildElementMentionChipModels` 순수 함수를 export한다. | +65 |
| MODIFY | `ui/src/components/PromptComposer.tsx` | chip row와 full `elementCatalog` 연결, composition/sticky Escape를 추가한다. full element load 성공 시 `syncElementCatalog(elements)`를 호출하고, element option 선택 시 local `elements.find(id)`의 **full `AssetItem`**을 `addElementFromMention(asset)`로 writer에 전달한다. writer가 반환한 tray item이 있을 때만 range를 치환한다. 최종 500줄 미만을 강제한다. | +40~50 |
| MODIFY | `ui/src/lib/referenceTray.ts` | `selectMissingElementIds(items, elementCatalog)` 순수 helper를 추가한다. catalog `null`은 미검증, `[]`는 검증된 empty로 구분하며 입력 순서와 ID dedupe를 보존한다. | +20 |
| MODIFY | `ui/src/store/storeReferenceImpl.ts` | 선택안 (a): `addTrayElementImpl(elementId, set, get, snapshot?)`가 optional full `AssetItem`을 검증하고 전용 `elementCatalog`에 ID upsert한 뒤 **같은 `mutateTray` 호출**에서 tray item을 만든다. resolution 순서는 valid snapshot → catalog → `state.assets`다. `syncElementCatalogImpl(records)`는 full records를 replace하고 missing IDs를 재계산한다. 기존 add/remove dedupe는 유지한다. | +45 |
| MODIFY | `ui/src/store/storeTypes.ts` | ID-only catalog를 폐기하고 `elementCatalog: AssetItem[] \| null`, `missingElementIds`, `syncElementCatalog(records)`, `addElementFromMention(asset): TrayItem \| null` 계약을 추가한다. `null`은 아직 catalog 검증 전이다. | +12 |
| MODIFY | `ui/src/store/useAppStore.ts` | full catalog/missing 초기값, sync action, `addElementFromMention(asset) => addTrayElementImpl(asset.id, set, get, asset)` binding을 추가한다. 기존 `addElementId(id) => addTrayElementImpl(id, set, get)` binding은 호환을 위해 보존한다. | +9 |
| MODIFY | `ui/src/store/storeGenerateEntryImpl.ts` | `generateImpl`의 prompt 확인 직후, image/video/multimode 분기 전에 `missingElementIds.length > 0`이면 early return한다. 버튼·Cmd/Ctrl+Enter·home에서 같은 진입 함수를 써도 provider 요청이 시작되지 않는다. | +5 |
| MODIFY | `ui/src/components/GenerateButton.tsx` | missing selection이 있으면 primary generate button을 native `disabled` 처리한다. runtime entry guard는 별도로 유지해 programmatic/keyboard 호출도 차단한다. | +4 |
| NEW | `tests/element-mention-ui-contract.test.js` | node:test 기반 EM-01..EM-12 계약. parser/helper와 actual selection writer/chip-model projection을 TS source에서 직접 import하고 나머지는 source assertion한다. fresh store(`assets=[]`) + full snapshot 선택을 실제 실행해 chip 1개와 selected ID를 검증한다. jsdom 없음. | +270~330 |

### 명시적 무변경 파일

- `ui/src/components/ElementMentionMenu.tsx`: 현재 keyboard, a11y, position, portal,
  empty state를 재사용하고 새 테스트로 고정한다.
- `ui/src/components/ElementMentionChip.tsx`: 이미 필요한 visual/accessibility props를
  제공하므로 수정하지 않는다.
- `ui/src/styles/element-mention.css`: 기존 chip/missing/mobile 규칙을 재사용한다.
- `lib/assetsStore.ts`: newest-first 정렬을 바꾸지 않고 source contract로 고정한다.

## PromptComposer 최소 변경 설계

### 1. IME와 sticky Escape

```ts
const composingRef = useRef(false);
const dismissedMentionKeyRef = useRef<string | null>(null);

const updateMentionAtCaret = (value: string, caret: number) => {
  if (composingRef.current) return;
  const next = findMentionAtCaret(value, caret);
  const key = next ? `${next.start}:${next.end}:${next.query}` : null;
  setMentionQuery(key && key !== dismissedMentionKeyRef.current ? next : null);
};
```

- `onCompositionStart`: `composingRef.current = true`, 열린 menu는 닫는다.
- composition 중 `onChange`: prompt text는 갱신하되 mention parser는 호출하지 않는다.
- `onCompositionEnd`: ref를 false로 바꾸고 committed `value/selectionStart`를 1회 평가한다.
- `onChange`의 실제 text mutation은 먼저 dismissed key를 null로 만든다. 즉 Escape 후
  다음 입력이 suppression 해제 경계다.
- menu가 열린 상태의 Escape는 현재 query key를 ref에 저장하고 닫는다. 이후 click,
  caret 재평가, resize로는 같은 key가 다시 열리지 않는다.
- Cmd/Ctrl+Enter 생성 shortcut보다 Escape 처리를 먼저 두되, menu keyboard listener의
  기존 selection 동작과 충돌하지 않게 Escape에서만 composer suppression을 기록한다.

### 2. 선택과 range 치환

- 현재 `insertTagAtMention`의 `slice(0, mention.start)` / `slice(mention.end)` 계약을
  유지한다. prompt 전체 replace나 caret 이후 text 손실을 허용하지 않는다.
- element option 선택 시 composer closure의 local `elements`에서 같은 ID의 full
  `AssetItem`을 찾고 `addElementFromMention(asset)`로 전달한다. menu용 축약 option을
  writer payload로 재구성하지 않는다. refs/name/kind/tags/metadata의 원본 snapshot을
  그대로 사용한다.
- writer는 snapshot의 `id === elementId`, `kind === "element"`를 검증한다. valid
  snapshot을 전용 `elementCatalog`에 ID upsert하고 같은 mutation에서 stable ID를 tray에
  기록한다. writer 반환값이 `null`이면 prompt를 치환하지 않고 menu를 유지하거나
  명시적 오류를 표시한다. silent close/no-op은 허용하지 않는다.
- writer가 반환한 tray item의 tag로만 현재 `@query` range를 치환한다.
- ID state는 prompt string과 독립이다. chip 제거는 `removeElementId(id)`만 호출하며
  text에 `@name`을 다시 넣지 않는다.
- 선택 후 `setMentionQuery(null)`로 menu를 닫는다.
- 이미 tray에 같은 `elementId`가 있으면 add를 재호출하지 않고
  `[data-element-id="..."]`의 chip body에 focus를 이동한다. store의 기존 dedupe도
  이중 안전장치로 유지한다.

#### 선택안 결정 — (a) writer에 full snapshot 전달

- 채택: `addTrayElementImpl(..., snapshot?)`가 record upsert와 tray mutation을 한 번에
  수행하므로 fresh store에서도 반환 직후 chip/range 처리가 가능하다.
- upsert 대상은 필터 가능한 `state.assets`가 아니라 전용 `elementCatalog`다. 전자는
  image-only/폴더/tag 결과일 수 있어 mention 선택 record를 섞으면 안 된다.
- 미채택 (b): `state.assets` 선 sync 후 ID writer 호출은 두 mutation의 순서 의존성과
  Assets filter view 오염을 만든다.
- 기존 `addElementId(id)`는 metadata/legacy 호환용으로 남기되 catalog/`state.assets`에
  record가 있을 때만 성공한다. menu production path는 full snapshot action만 쓴다.

### 3. ordered/missing chip

- source order는 `selectElementItems(trayItems)`이며 assets 배열 정렬로 다시 sort하지
  않는다.
- live `elementCatalog` lookup 성공 시 현재 `name`, `metadata.elementKind`,
  `elementPreviewPath`를 사용한다. writer가 방금 받은 snapshot을 catalog에 upsert하므로
  fresh selection 직후에도 이 lookup이 성공한다.
- lookup 실패 시 tray snapshot의 `nameAtInsertion`을 표시하고 `missing=true`를 넘긴다.
  선택 ID는 보존한다.
- remove button의 accessible name은 기존 `Remove ${name} element`를 그대로 사용해
  각 chip마다 독립 이름을 갖는다.
- catalog load 전 `elementCatalog === null`은 missing이 아니다. full load 성공 후
  존재하지 않는 selected ID만 missing으로 전환한다. fresh selection snapshot은 먼저
  upsert되므로 full sync가 해당 ID를 포함하는 동안 missing으로 오판하지 않는다.

### 4. generation block

- UI gate: `GenerateButton`은 `missingElementIds.length > 0`이면 disabled.
- runtime gate: `generateImpl`은 video/multimode/image 분기 전에 return. 이를 통해
  버튼 외 Cmd/Ctrl+Enter나 직접 action 호출도 provider/API 호출로 진행하지 않는다.
- 제거로 마지막 missing ID가 사라지면 `mutateTray`가 missing 목록을 즉시 비우고
  generation을 다시 활성화한다.
- server의 `UNKNOWN_ELEMENT_ID`는 최종 방어선으로 유지하되, 정상 UI 경로의 차단을
  server 오류에 의존하지 않는다.

## `tests/element-mention-ui-contract.test.js` 설계

### 테스트 하네스

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { findMentionAtCaret } from "../ui/src/lib/elementMention.ts";
import { selectMissingElementIds } from "../ui/src/lib/referenceTray.ts";
import { buildElementMentionChipModels } from "../ui/src/components/composer/ElementMentionChips.tsx";
import { addTrayElementImpl, syncElementCatalogImpl } from "../ui/src/store/storeReferenceImpl.ts";
```

- parser/missing selector뿐 아니라 actual `addTrayElementImpl`과 chip-model projection도
  직접 실행한다. test-local `createReferenceStoreHarness`는 functional `set`과 `get`을
  제공하고 초기 `assets=[]`, `elementCatalog=null`, `trayItems=[]`를 명시한다.
- TSX는 렌더하지 않는다. `PromptComposer`, menu, chip row/chip, generate entry/button,
  CSS, assets store를 `readFileSync`로 읽고 regex와 source-order assertion을 쓴다.
- `composer-mention-parity-contract.test.js`의 tray-first 계약과 중복되는 assertion은
  그 파일을 수정하지 않고, EM 기준에 필요한 최소 교차 확인만 둔다.

### EM-01 — `@` 입력 / recent menu

- `findMentionAtCaret("@", 1)`이 `{ start: 0, end: 1, query: "" }`를 반환한다.
- 시작, 공백, `(`, `[` 뒤의 `@`가 모두 trigger임을 직접 검증한다.
- menu source에서 empty normalized query가 `elements`를 그대로 반환하는지 확인한다.
- `lib/assetsStore.ts`의 `ORDER BY created_at DESC, id DESC`를 확인해 빈 query의 입력이
  newest-first recent order임을 고정한다.

### EM-02 — `@ca` range/filter

- `findMentionAtCaret("make @ca now", 8)`의 range가 `start=5`, `end=8`, query=`ca`다.
- menu가 `query.trim().toLocaleLowerCase()`를 쓰고 name과 tags 각각을
  `toLocaleLowerCase().includes(normalized)`로 필터하는지 확인한다.
- 결과 0개에서 `element-mention-menu__empty`와 명시적 "No matching elements"가
  렌더되는지 확인한다.

### EM-03 — email/non-boundary 배제

- `user@example.com`의 `@example` caret과 `foo@ca`가 null임을 직접 검증한다.
- 허용 경계가 아닌 comma/slash 뒤의 `@`도 null인지 검증한다.

### EM-04 — 국제 문자와 line boundary

- 한글, 영문, 숫자, `_`, `-`가 섞인 query가 전체 range로 반환되는지 검증한다.
- caret 검색이 이전 newline을 넘지 않으며, 현재 줄에 `@`가 없으면 null인지 검증한다.
- newline 직후의 `@한글_2-test`는 새 mention으로 인식하는지 검증한다.

### EM-05 — IME composition 안정성

- composer source에 composition ref, `onCompositionStart`, `onCompositionEnd`가 있고
  composition 중 prompt text만 갱신하며 mention update를 생략하는 guard가 있는지
  확인한다.
- composition end가 committed value와 caret으로 정확히 1회 update하는지 확인한다.
- Escape suppression ref가 같은 range/query key를 막고, 다음 `onChange` mutation에서만
  clear되는 source order를 확인한다.

### EM-06 — keyboard 선택과 확정

- menu source에서 ArrowDown/ArrowUp modulo wrap, Home=0, End=last,
  Enter/Tab=`selectActive`, Escape=`onClose`를 확인한다.
- selection source에서 local full `AssetItem`을 `addElementFromMention`에 전달하고,
  writer 반환 item이 있을 때만 `insertTagAtMention`이
  `mention.start/end`만 치환하며, ID state가 prompt text와 별도 tray에 저장되는지
  확인한다.
- 선택 뒤 menu가 null로 닫히는지 확인한다.

#### Fresh-store executable regression (B1)

```js
test("fresh Create selection registers the ID and produces a chip", () => {
  const hero = elementAsset({ id: "el_hero", name: "Hero", refs: ["hero.png"] });
  const store = createReferenceStoreHarness({ assets: [], elementCatalog: null });

  const item = addTrayElementImpl(hero.id, store.set, store.get, hero);

  assert.equal(item?.source.elementId, hero.id);
  assert.deepEqual(store.get().selectedElementIds, [hero.id]);
  assert.equal(store.get().elementCatalog?.find((asset) => asset.id === hero.id)?.name, "Hero");
  const chips = buildElementMentionChipModels(
    store.get().trayItems,
    store.get().elementCatalog,
    store.get().missingElementIds,
  );
  assert.equal(chips.length, 1);
  assert.equal(chips[0].elementId, hero.id);
  assert.equal(chips[0].missing, false);
});
```

추가 negative assertion: snapshot ID 불일치 또는 `kind !== "element"`이면 writer가
`null`을 반환하고 catalog/tray/selected IDs를 변경하지 않는다.

### EM-07 — Escape sticky-close

- Escape가 열린 menu를 닫고 현재 mention key를 dismissed ref에 저장하는지 확인한다.
- 같은 text/caret의 click 재평가로는 열리지 않고, 다음 text mutation 뒤에는 다시
  열릴 수 있는 순서를 확인한다.

### EM-08 — mobile bottom sheet

- CSS에 `@media (max-width: 640px)`, `.element-mention-menu.is-mobile`,
  `left: 0`, `right: 0`, `bottom: 0`, safe-area padding이 있는지 확인한다.
- menu가 mobile에서 inline caret position style을 생략하는지 확인한다.

### EM-09 — missing chip / generation block

- `selectMissingElementIds`가 full catalog에 없는 selected ID를 선택 순서대로 반환하고,
  catalog 미검증(null)에서는 빈 목록을 반환하는지 직접 검증한다.
- chip row가 lookup 실패 시 `nameAtInsertion`, `missing=true`로
  `ElementMentionChip`을 렌더하는지 확인한다.
- fresh-store test와 같은 harness에서 `syncElementCatalogImpl([], set, get)`을 실행해
  tray/selected ID는 보존되고 `missingElementIds=["el_hero"]`, chip model의
  `missing=true`로 전환되는지 직접 검증한다.
- chip primitive에 `is-missing`, warning accessible label, thumbnail/name/kind가 있고
  generate entry가 provider 분기 전에 early return하는지 확인한다.
- GenerateButton의 native disabled가 같은 missing state를 소비하는지 확인한다.

### EM-10 — duplicate selection

- `storeReferenceImpl.ts`의 existing element ID predicate와 no-patch return을 확인한다.
- 같은 full snapshot으로 actual writer를 두 번 실행해 두 번째 반환이 `null`이고
  tray/selected IDs/catalog/chip model이 각각 하나인지 직접 검증한다.
- composer가 중복 선택 시 기존 `[data-element-id]` chip으로 focus하고 menu를 닫는지
  확인한다.

### EM-11 — chip remove

- chip row의 remove callback이 element ID를 전달하고 composer가
  `removeElementId(id)`에 연결하는지 확인한다.
- `removeTrayElementImpl`이 element ID로 item을 찾고 token 단위 제거 writer를
  재사용하는지 확인한다.
- remove button이 `type="button"`과 element name을 포함한 독립 `aria-label`을
  가지는지 확인한다.

### EM-12 — anchor recalc/a11y cleanup

- caret mirror가 textarea value를 caret까지 복제하고 marker rect를 계산하는지 확인한다.
- bottom space 240px 기준 top/bottom 배치, 12px viewport clamp를 확인한다.
- resize와 textarea scroll이 rAF update를 등록하고 cleanup에서 listener를 제거하는지
  확인한다.
- menu가 `createPortal(..., document.body)`를 사용하고 anchor가 사라지면 close하는지
  확인한다.
- listbox/option/`aria-selected`, textarea의 `aria-controls`, `aria-expanded`,
  `aria-activedescendant` 설정과 close cleanup의 세 attribute 제거를 확인한다.

## 활성 시나리오별 수용 기준

### A. IME composition

1. textarea에서 `@캐`를 조합하는 동안 compositionstart 후 여러 onChange가 발생한다.
2. prompt value는 그대로 반영되지만 menu query/active option은 중간 조합 문자열로
   갱신되지 않는다.
3. compositionend의 확정 문자열과 caret으로 한 번만 parser를 실행한다.
4. 확정 query가 유효하면 name/tags 필터 결과가 열린다.

수용: EM-04/05 focused assertions 통과. 조합 중 menu flicker나 option reset을 만드는
source path가 없다.

### B. fresh Create selection

1. Create workspace를 처음 열어 global `state.assets=[]`, `elementCatalog=null`인 상태에서
   local `loadAllElementAssets()` 결과에는 element A가 존재한다.
2. menu에서 A를 선택하면 composer가 full `AssetItem` snapshot을 writer로 전달한다.
3. writer는 snapshot을 `elementCatalog`에 upsert하고 같은 mutation에서 tray item과
   `selectedElementIds=[A.id]`를 만든다.
4. 반환 item의 tag로 현재 mention range를 치환하고 chip model은 A 하나를
   `missing=false`로 만든다.

수용: actual writer + chip model executable test가 통과한다. `state.assets=[]` 조건을
fixture에서 생략하거나 source regex만으로 대체할 수 없다.

### C. missing element

1. element를 선택해 stable ID가 tray에 들어가고 chip이 렌더된다.
2. 이후 full catalog sync가 해당 ID를 제외하면 writer가 저장한 tray snapshot과 ID는
   삭제되지 않고 missing warning으로 바뀐다.
3. GenerateButton은 disabled이며 `generate()`를 직접 호출해도 image/video/multimode
   request entry가 실행되지 않는다.
4. missing chip을 제거하면 ID와 missing 목록이 함께 사라지고 generation이 다시
   가능해진다.

수용: EM-09/11 assertions 통과. provider request 함수보다 앞선 runtime guard가 있다.

### D. duplicate select

1. `@hero`로 element A를 선택한다.
2. 다시 element A를 선택한다.
3. tray의 A ID와 chip은 각각 하나이며 순서는 변하지 않는다.
4. 기존 chip에 focus가 이동하고 menu는 닫힌다.

수용: EM-06/10 assertions 통과. duplicate ID를 새 token/tag로 materialize하지 않는다.

## 전체 완료 기준

- EM-01..EM-12 각각에 최소 하나 이상의 명시적 test block 또는 subtest가 있고,
  위 assertion 목록을 빠짐없이 인코딩한다.
- parser boundary matrix에는 empty query, `@ca` range, email no-trigger, 한글/숫자/`_`/`-`,
  no-newline-crossing, start/space/`(`/`[` boundary가 모두 포함된다.
- menu 계약에는 recent order, locale-lowercase name+tag filter, empty state,
  keyboard wrap/Home/End/Enter/Tab/Escape가 포함된다.
- a11y 계약에는 listbox/option/aria-selected와 controls/expanded/active-descendant 설정 및
  cleanup이 포함된다.
- positioning 계약에는 caret mirror, above/below, viewport clamp, rAF scroll/resize,
  portal, mobile bottom sheet가 포함된다.
- selection 계약에는 stable ID, 현재 `@query` range만 치환, text와 ID 상태 분리,
  menu close, dedupe, remove가 포함된다. 특히 `state.assets=[]`에서 full `AssetItem`
  snapshot으로 actual writer를 실행해 selected ID와 non-missing chip model이 각각 하나
  생기는 테스트가 필수다.
- chip은 textarea 밖에서 ordered render되고 thumbnail/name/kind, 독립 remove name,
  missing 상태를 제공한다. missing selection은 UI와 runtime 양쪽에서 generation을 막는다.
- `PromptComposer.tsx`는 구현 후에도 500줄 미만이다. 넘으면 inline 렌더/해석 코드를
  `ElementMentionChips.tsx`로 더 이동하고 예외를 두지 않는다.

## 검증 명령

```bash
node --import tsx --test tests/element-mention-ui-contract.test.js
npm run typecheck
npm run typecheck:tests
npm run test:inventory
cd ui && npm run build
```

focused test가 green이어도 전체 suite 회귀 가능성이 있으므로 phase 완료 판정 전
`npm test`를 추가 실행한다. `test:inventory`가 새 파일 때문에 generated inventory
drift를 보고하면 `scripts/classify-tests.mjs`가 소유한 문서를 생성 명령으로 갱신하며,
수동 편집하지 않는다.
