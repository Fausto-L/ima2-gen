---
created: 2026-07-12
tags: [ima2-gen, phase, controls, components]
---

# Phase 020 — 컨트롤 킷 통일 (방식 변경, 기능 무변경)

스펙: `001_design-language.md`의 마이크로 인터랙션 절 + 이 문서.
지금 우측 패널/설정에는 컨트롤 방식이 컴포넌트마다 제각각이다
(`OptionGroup` 세그먼트, `ProviderSelect`/`ImageModelSelect`/
`GrokModelPicker` 셀렉트, `SizePicker`/`CountPicker`/`ReasoningEffortSelect`,
`WebSearchToggle`/`MobileSettingsToggle` 토글, `HistoryStripLayoutToggle`).
이걸 한 벌의 컨트롤 킷으로 통일한다. 상태/로직은 그대로, 표현만 바꾼다.

## 범위

1. **컨트롤 킷 신설** (`ui/src/components/controls/`):
   - `Select` — 글래스 드롭다운(패널+blur), 키보드 내비, 항목에 부가정보
     슬롯(모델 설명·비용 힌트).
   - `Segmented` — 2~4택 세그먼트(현 OptionGroup 대체).
   - `Chip`/`ChipRow` — 선택형 칩. **060 프리셋·070 멘션이 그대로 재사용하는
     기반 컴포넌트**라 이 phase에서 먼저 만든다(디자인→기능 의존의 대표 예).
   - `Toggle` — 남길 곳(단순 on/off)에만. 다값 토글은 Segmented나 Select로
     전환.
2. **전환 매핑** (2026-07-12 확정 — sol 감사 2라운드 반영):

   | 기존 컨트롤 | 처분 | 비고 |
   |---|---|---|
   | `OptionGroup` | **Segmented로 이관** | 계약·클래스명 완전 보존 shim 재수출 + 화살표 키 내비 추가. 소비처 3곳 무변경 |
   | `GrokModelPicker` | Segmented 소비로 전환 | 수제 option-btn 마크업 제거 |
   | `ReasoningEffortSelect` (native select) | **controls/Select** | 글래스 리스트박스 |
   | `settings/GrokPlannerSelect` (native select) | controls/Select | |
   | `VideoControlsPanel` 모델 select | controls/Select | 해당 select만, 나머지 불변 |
   | `WebSearchToggle` label 변형 | **controls/Toggle**(스위치) | compact 아이콘 변형은 그대로 |
   | `HistoryStripLayoutToggle` | Segmented (`history-layout-toggle` 클래스 유지) | 3택 |
   | `SizePicker` / `CountPicker` 그리드 | 유지 + CSS 토큰 재스타일 | 그리드가 옳은 형태 |
   | `ProviderSelect` | 유지 (025에서 카드로 재설계) | |
   | `ImageModelSelect` | **020 불개입** | `.image-model-select__*`를 에이전트 레인(AgentModelSelector)이 공유 — 010 토큰 승계로 충분 |
   | SettingsWorkspace 갤러리 스코프 select | 025로 이연 | 설정 재설계에서 킷 소비 |
   | `WorkspaceProfileSettings` / `GeminiKeySection` select | 025로 이연 | 〃 |
   | `ImageModelSelect` settings 변형 native select | 025로 이연 | |
   | card-news `TextFieldCard` select 4곳 | 무기한 이연 | dev-only 표면 |

3. 라벨 문법 통일: mono 11px uppercase eyebrow(사이트 `.section-tag` 등가).
   **결정**: `.section-title`은 컴포저 PROMPT/프로바이더 헤딩/비디오 라벨/
   히스토리 헤딩 등 앱 전역 마이크로 라벨에 쓰이며 전부 라벨 문법 대상이
   맞음 — 전역 적용 승인(본문 헤딩 사용처 없음, 감사로 확인).
4. 포커스/hover 규칙: `:focus-visible` 시안 아웃라인, foil-hover는
   Generate 계열에만.

## 명시적 제외

- 컨트롤의 의미/옵션 변경, 새 설정 항목 추가.

## Done 기준

- 전환 매핑 표 100% 채움 + 컴포넌트별 교체 완료.
- 기존 계약 테스트 green(특히 settings persistence, mobile compose).
- 키보드 전 조작 가능(셀렉트/세그먼트 tab-arrow-enter) 확인.

상태: **done** (2026-07-12, 커밋 6d2e236 — 게이트 green, assets/020/ 실화면 검수)

## Diff-Level Record

- 커밋: `6d2e236`
- 범위: `67b2e01..6d2e236`
- 집계: 19 files changed, +631 / -119.

| 경로 | 작업 | + / - |
|---|---|---:|
| `tests/gallery-navigation-ux-contract.test.js` | MODIFY | +1 / -1 |
| `tests/settings-workspace-layout-contract.test.js` | MODIFY | +3 / -1 |
| `ui/src/components/GenerateButton.tsx` | MODIFY | +1 / -1 |
| `ui/src/components/GrokModelPicker.tsx` | MODIFY | +7 / -17 |
| `ui/src/components/HistoryStripLayoutToggle.tsx` | MODIFY | +9 / -17 |
| `ui/src/components/OptionGroup.tsx` | MODIFY | +5 / -46 |
| `ui/src/components/ReasoningEffortSelect.tsx` | MODIFY | +12 / -12 |
| `ui/src/components/VideoControlsPanel.tsx` | MODIFY | +6 / -8 |
| `ui/src/components/WebSearchToggle.tsx` | MODIFY | +12 / -0 |
| `ui/src/components/controls/Chip.tsx` | NEW | +63 / -0 |
| `ui/src/components/controls/Segmented.tsx` | NEW | +77 / -0 |
| `ui/src/components/controls/Select.tsx` | NEW | +165 / -0 |
| `ui/src/components/controls/Toggle.tsx` | NEW | +35 / -0 |
| `ui/src/components/controls/index.ts` | NEW | +4 / -0 |
| `ui/src/components/settings/GrokPlannerSelect.tsx` | MODIFY | +6 / -8 |
| `ui/src/index.css` | MODIFY | +8 / -0 |
| `ui/src/styles/controls.css` | NEW | +209 / -0 |
| `ui/src/styles/form-controls.css` | MODIFY | +5 / -5 |
| `ui/src/styles/sidebar.css` | MODIFY | +3 / -3 |

Before → After 핵심 패턴:

- 화면별 option button/native select/독자 toggle → `Segmented`, `Select`, `Toggle`, `Chip` 4개 공용 primitive.
- 산재한 컨트롤 스타일 → 신규 `controls.css`의 `.ctl-*` 규칙으로 통합.
- `OptionGroup` 직접 렌더링 → 기존 props·클래스 계약을 보존하는 `Segmented` shim 재수출.
- 개별 키보드 동작 편차 → Segmented 방향키 순환과 Select listbox 탐색으로 일관화.

## 전체 파일 변경표

아래 표는 `git diff --numstat 67b2e01..6d2e236`의 실제 결과다.
기능 변경보다 공용 primitive 신설과 소비처 치환이 중심이며, 테스트 변경은
새 클래스/구조 계약을 반영하는 최소 수정이다.

| # | 경로 | 상태 | 추가 | 삭제 | 역할 |
|---:|---|---|---:|---:|---|
| 1 | `tests/gallery-navigation-ux-contract.test.js` | M | 1 | 1 | 생성 버튼 foil 클래스 계약 갱신 |
| 2 | `tests/settings-workspace-layout-contract.test.js` | M | 3 | 1 | Settings의 공용 Select 계약 반영 |
| 3 | `ui/src/components/GenerateButton.tsx` | M | 1 | 1 | Generate 계열에만 foil-hover 부여 |
| 4 | `ui/src/components/GrokModelPicker.tsx` | M | 7 | 17 | 수제 버튼 묶음을 Segmented로 치환 |
| 5 | `ui/src/components/HistoryStripLayoutToggle.tsx` | M | 9 | 17 | 3택 레이아웃 선택을 Segmented로 치환 |
| 6 | `ui/src/components/OptionGroup.tsx` | M | 5 | 46 | 구현 제거 후 호환 shim으로 축소 |
| 7 | `ui/src/components/ReasoningEffortSelect.tsx` | M | 12 | 12 | native select를 공용 Select로 치환 |
| 8 | `ui/src/components/VideoControlsPanel.tsx` | M | 6 | 8 | planner model select만 공용 Select로 치환 |
| 9 | `ui/src/components/WebSearchToggle.tsx` | M | 12 | 0 | label variant를 공용 Toggle로 치환 |
| 10 | `ui/src/components/controls/Chip.tsx` | A | 63 | 0 | Chip과 ChipRow primitive 신설 |
| 11 | `ui/src/components/controls/Segmented.tsx` | A | 77 | 0 | 2~4택 primitive 신설 |
| 12 | `ui/src/components/controls/Select.tsx` | A | 165 | 0 | glass listbox primitive 신설 |
| 13 | `ui/src/components/controls/Toggle.tsx` | A | 35 | 0 | boolean switch primitive 신설 |
| 14 | `ui/src/components/controls/index.ts` | A | 4 | 0 | public barrel export 신설 |
| 15 | `ui/src/components/settings/GrokPlannerSelect.tsx` | M | 6 | 8 | native select를 공용 Select로 치환 |
| 16 | `ui/src/index.css` | M | 8 | 0 | controls stylesheet와 전역 focus 규칙 연결 |
| 17 | `ui/src/styles/controls.css` | A | 209 | 0 | Select/Toggle/Chip/foil 스타일 신설 |
| 18 | `ui/src/styles/form-controls.css` | M | 5 | 5 | legacy option 계열을 새 토큰으로 재스타일 |
| 19 | `ui/src/styles/sidebar.css` | M | 3 | 3 | sidebar control 표현 정합화 |
| 합계 | 19 files |  | 631 | 119 | `6d2e236` |

## 컴포넌트별 상세

### Segmented

#### 목적과 계약

`Segmented`는 동시에 하나를 고르는 2~4개 선택지에 쓰는 제어다.
기존 `OptionGroup`의 generic과 DOM 클래스 계약을 보존하면서 방향키 이동과
`aria-pressed`를 추가했다. 값 타입은 `string` literal union으로 유지된다.

```tsx
export type SegmentedItem<V extends string> = {
  value: V;
  label: ReactNode;
  sub?: ReactNode;
  color?: string;
  disabled?: boolean;
};

type Props<V extends string> = {
  title?: string;
  help?: ReactNode;
  items: ReadonlyArray<SegmentedItem<V>>;
  value: V;
  onChange: (v: V) => void;
  className?: string;
};
```

#### DOM 및 CSS class anatomy

| 계층 | 클래스/속성 | 의미 |
|---|---|---|
| root | `.option-group` | legacy 레이아웃 계약의 최상위 |
| root modifier | 전달된 `className` | 소비처별 스코프 보존 |
| title | `.section-title` | 선택적 eyebrow 제목 |
| row | `.option-row` | `role="group"`, keydown 수신 |
| button | `.option-btn` | 각 선택지의 실제 button |
| selected | `.option-btn.active` | 현재 값 표시 |
| metadata | `.option-sub` | 보조 설명/속도/비용 힌트 |
| help | `.option-help` | 그룹 하단의 선택적 도움말 |
| state | `disabled` | 비활성 항목의 native button 상태 |
| state | `aria-pressed` | 단일 선택 상태를 보조기기에 전달 |
| locator | `data-value` | 이동 후 다음 button focus 검색 |

#### 키보드 동작

| 입력 | 결과 |
|---|---|
| `Tab` | 브라우저 기본 순서로 button에 진입 |
| `ArrowRight` | disabled를 제외한 다음 값 선택, 끝에서 처음으로 순환 |
| `ArrowLeft` | disabled를 제외한 이전 값 선택, 처음에서 끝으로 순환 |
| `Enter` | 현재 focus button의 native click 실행 |
| `Space` | 현재 focus button의 native click 실행 |
| disabled 항목 | 방향키 후보에서 제외되고 click도 차단 |

핵심 이동 구현은 다음과 같다.

```tsx
const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const enabled = items.filter((it) => !it.disabled);
  if (enabled.length === 0) return;
  const current = enabled.findIndex((it) => it.value === value);
  const step = event.key === "ArrowRight" ? 1 : -1;
  const next = enabled[(current + step + enabled.length) % enabled.length];
  event.preventDefault();
  onChange(next.value);
  rowRef.current
    ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
    ?.focus();
};
```

#### 실제 사용 예: GrokModelPicker

```tsx
<Segmented<ImageModel>
  title={t("quality.grokModelTitle")}
  items={GROK_MODELS}
  value={imageModel}
  onChange={setImageModel}
/>
```

#### 실제 사용 예: HistoryStripLayoutToggle

```tsx
<Segmented<HistoryStripLayout>
  className="history-layout-toggle"
  items={OPTIONS.map((option) => ({
    value: option,
    label: t(`settings.appearance.historyStripLayout.${option}`),
  }))}
  value={layout}
  onChange={setLayout}
/>
```

### Select

#### 목적과 props

`Select`는 native `<select>`로 표현하기 어려운 항목별 부가정보를 허용하는
glass listbox다. trigger가 focus를 유지하고, 열려 있는 동안 active index를
내부 상태로 관리한다.

```tsx
export type SelectItem<V extends string> = {
  value: V;
  label: ReactNode;
  sub?: ReactNode;
  disabled?: boolean;
};

type Props<V extends string> = {
  items: ReadonlyArray<SelectItem<V>>;
  value: V;
  onChange: (v: V) => void;
  ariaLabel?: string;
  className?: string;
  id?: string;
};
```

#### 상태 모델

| 상태/참조 | 역할 |
|---|---|
| `open` | listbox mount 여부 |
| `activeIndex` | 키보드/포인터 탐색의 현재 후보 |
| `selected` | 외부 `value`와 일치하는 항목 |
| `rootRef` | 외부 pointerdown 판정 경계 |
| `listRef` | active 항목 scrollIntoView 대상 |
| `listId` | trigger의 `aria-controls` 연결 |

#### 키보드 동작

| 상태 | 입력 | 결과 |
|---|---|---|
| 닫힘 | `Enter` | 현재 선택에서 list를 연다 |
| 닫힘 | `Space` | 현재 선택에서 list를 연다 |
| 닫힘 | `ArrowDown` | list를 연다 |
| 닫힘 | `ArrowUp` | list를 연다 |
| 열림 | `ArrowDown` | enabled 다음 항목으로 순환 |
| 열림 | `ArrowUp` | enabled 이전 항목으로 순환 |
| 열림 | `Home` | index 0을 active로 지정 |
| 열림 | `End` | 마지막 index를 active로 지정 |
| 열림 | `Enter` | active 항목 commit 후 닫기 |
| 열림 | `Space` | active 항목 commit 후 닫기 |
| 열림 | `Escape` | 값 변경 없이 닫기 |
| 열림 | `Tab` | 기본 focus 이동을 허용하며 닫기 |
| 열림 | 외부 pointerdown | 값 변경 없이 닫기 |
| 열림 | 항목 pointer enter | 해당 index를 active로 지정 |

#### DOM 및 CSS class anatomy

| 계층 | 클래스 | 역할 |
|---|---|---|
| root | `.ctl-select` | relative positioning anchor |
| trigger | `.ctl-select__trigger` | combobox를 여는 button |
| open | `.ctl-select__trigger.is-open` | 열린 배경/테두리 및 caret 회전 |
| value | `.ctl-select__value` | 선택 label, ellipsis 처리 |
| value meta | `.ctl-select__value-sub` | 선택 항목 보조정보 |
| caret | `.ctl-select__caret` | dropdown 방향 피드백 |
| popup | `.ctl-select__list` | absolute glass listbox |
| item | `.ctl-select__item` | `role="option"` 행 |
| active | `.ctl-select__item.is-active` | 탐색 중 후보 |
| selected | `.ctl-select__item.is-selected` | 실제 외부 value |
| disabled | `.ctl-select__item.is-disabled` | 선택 불가 후보 |
| label | `.ctl-select__item-label` | 항목 주 라벨 |
| metadata | `.ctl-select__item-sub` | 항목 부가정보 |

#### 실제 사용 예: ReasoningEffortSelect

```tsx
<div className="ctl-select-wrap settings-reasoning-effort">
  <Select<ReasoningEffort>
    id="settings-reasoning-effort"
    items={items}
    value={reasoningEffort}
    onChange={setReasoningEffort}
  />
</div>
```

#### 실제 사용 예: planner model

```tsx
<Select
  className="video-controls__pill"
  items={plannerConfig.options.map((model) => ({ value: model, label: model }))}
  value={plannerConfig.model}
  onChange={(model) => void onPlannerChange(model)}
  ariaLabel={t("video.plannerModelTitle")}
/>
```

### Toggle

#### 목적과 props

Toggle은 의미가 진짜 boolean인 경우에만 쓴다. 3상태 이상이거나 서로 다른
의미의 값은 Segmented 또는 Select의 책임이다.

```tsx
type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};
```

#### 접근성과 키보드

| 항목 | 구현 |
|---|---|
| semantic | native `button` + `role="switch"` |
| value | `aria-checked={checked}` |
| name | `aria-label` 또는 시각 label |
| keyboard | native button의 `Enter`, `Space` |
| disabled | native `disabled`로 click/focus 차단 |
| state class | root의 `.is-on` |

#### CSS anatomy

| 클래스 | 역할 |
|---|---|
| `.ctl-toggle` | inline flex root |
| `.ctl-toggle.is-on` | on 상태의 text color |
| `.ctl-toggle__track` | 30×17 pill track |
| `.ctl-toggle__thumb` | 11×11 원형 thumb |
| `.ctl-toggle__label` | 선택적 텍스트 라벨 |

#### 실제 사용 예

```tsx
<Toggle
  checked={webSearchEnabled}
  onChange={setWebSearchEnabled}
  label={label}
  className="web-search-toggle web-search-toggle--label"
/>
```

`compact` variant는 아이콘 중심의 별도 표현 계약 때문에 기존 button을 유지한다.
즉 컴포넌트 전체가 아니라 `variant === "label"` 분기만 공용 Toggle을 소비한다.

### Chip / ChipRow

#### 목적과 props

Chip은 060 preset과 070 mention이 재사용할 토대다. 020에서는 즉시 대규모
소비처를 만들기보다 선택, 제거, disabled, 그룹 semantics를 먼저 고정했다.

```tsx
type ChipProps = {
  selected?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  title?: string;
};

type ChipRowProps = {
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
};
```

#### 행동과 키보드

| 구성 | 행동 |
|---|---|
| body button | `onSelect` 호출 |
| body keyboard | native `Enter`/`Space` click |
| selectable body | `aria-pressed={selected}` 제공 |
| remove button | 독립 `onRemove` 호출 |
| remove name | `aria-label="Remove"` |
| disabled root | `.is-disabled` 시각 상태 |
| disabled buttons | 두 button 모두 native disabled |
| row | `role="group"` + 선택적 `aria-label` |

#### CSS anatomy

| 클래스 | 역할 |
|---|---|
| `.ctl-chip-row` | wrapping flex group |
| `.ctl-chip` | pill 외곽과 overflow 경계 |
| `.ctl-chip.is-selected` | accent 선택 상태 |
| `.ctl-chip.is-disabled` | opacity 상태 |
| `.ctl-chip__body` | 주 action button |
| `.ctl-chip__remove` | 보조 제거 action |

#### 사용 형태

```tsx
<ChipRow ariaLabel="Style presets">
  {presets.map((preset) => (
    <Chip
      key={preset.id}
      selected={preset.id === selectedId}
      onSelect={() => setSelectedId(preset.id)}
      onRemove={preset.removable ? () => removePreset(preset.id) : undefined}
    >
      {preset.label}
    </Chip>
  ))}
</ChipRow>
```

위 예시는 primitive 계약을 설명하는 사용 형태이며, 020 커밋의 직접 소비처는
아니다. 실제 preset/mention 결선은 후속 phase의 책임이다.

## OptionGroup 호환 shim

### Before

```tsx
export function OptionGroup<V extends string>({ title, help, items, value, onChange }: Props<V>) {
  return (
    <div className="option-group">
      {title ? <div className="section-title">{title}</div> : null}
      <div className="option-row">
        {items.map((it) => (
          <button
            key={it.value}
            className={`option-btn${it.value === value ? " active" : ""}`}
            style={it.color ? { color: it.color } : undefined}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            type="button"
          >
            {it.label}
            {it.sub ? <span className="option-sub">{it.sub}</span> : null}
          </button>
        ))}
      </div>
      {help ? <p className="option-help">{help}</p> : null}
    </div>
  );
}
```

### After

```tsx
// Phase 020: OptionGroup is now a compatibility shim over the controls kit.
// Segmented preserves the full legacy contract (props, generics, classnames)
// and adds arrow-key navigation. New code should import from "./controls".
export { Segmented as OptionGroup } from "./controls/Segmented";
export type { SegmentedItem as OptionItem } from "./controls/Segmented";
```

### 보존되는 계약

| 계약 | 보존 방식 |
|---|---|
| `OptionGroup` named export | alias re-export |
| `OptionItem` named type | `SegmentedItem` alias re-export |
| generic `V extends string` | Segmented generic이 그대로 제공 |
| `.option-group` | Segmented root가 유지 |
| `.option-row` | Segmented row가 유지 |
| `.option-btn`/`.active` | button class가 유지 |
| `.option-sub` | metadata class가 유지 |
| `.option-help` | help paragraph가 유지 |
| 기존 import 경로 | 파일 자체를 shim으로 유지 |
| 추가 개선 | 방향키 순환, `aria-pressed` |

## 소비처 전환 상세

### GrokModelPicker

Before는 `GROK_MODELS.map`과 button 상태 class를 소비처가 직접 소유했다.
After는 데이터와 store 결선만 남기고 표현·키보드를 Segmented로 위임한다.

```tsx
// before
<div className="option-row">
  {GROK_MODELS.map((m) => (
    <button
      className={`option-btn${imageModel === m.value ? " active" : ""}`}
      onClick={() => setImageModel(m.value as ImageModel)}
    >
      {m.label}<br /><span className="option-sub">{m.sub}</span>
    </button>
  ))}
</div>

// after
<Segmented<ImageModel>
  title={t("quality.grokModelTitle")}
  items={GROK_MODELS}
  value={imageModel}
  onChange={setImageModel}
/>
```

### HistoryStripLayoutToggle

Before의 전용 `.history-layout-toggle__btn` button 반복을 제거했다. After는
기존 root scope class를 `className`으로 유지해 주변 레이아웃 선택자를 보호한다.

```tsx
// before
<div className="history-layout-toggle" role="group">
  {OPTIONS.map((option) => (
    <button className={`history-layout-toggle__btn ${layout === option ? "is-active" : ""}`}>
      {t(`settings.appearance.historyStripLayout.${option}`)}
    </button>
  ))}
</div>

// after
<Segmented<HistoryStripLayout>
  className="history-layout-toggle"
  items={OPTIONS.map((option) => ({
    value: option,
    label: t(`settings.appearance.historyStripLayout.${option}`),
  }))}
  value={layout}
  onChange={setLayout}
/>
```

### ReasoningEffortSelect

Before는 DOM event cast가 필요했다. After는 generic value callback이
`ReasoningEffort`를 직접 전달한다.

```tsx
// before
<select id="settings-reasoning-effort" value={reasoningEffort} onChange={onChange}>
  {REASONING_EFFORT_OPTIONS.map((option) => (
    <option value={option.value}>{t(option.fullLabelKey)}</option>
  ))}
</select>

// after
<Select<ReasoningEffort>
  id="settings-reasoning-effort"
  items={items}
  value={reasoningEffort}
  onChange={setReasoningEffort}
/>
```

### GrokPlannerSelect

```tsx
// before
<select value={config.model} onChange={(e) => void onChange(e.target.value)}>
  {config.options.map((m) => <option value={m}>{m}</option>)}
</select>

// after
<Select
  items={config.options.map((model) => ({ value: model, label: model }))}
  value={config.model}
  onChange={(model) => void onChange(model)}
  ariaLabel={t("settings.grokPlanner.title")}
/>
```

### VideoControlsPanel

Video panel 전체를 바꾸지 않고 planner model native select 한 곳만 치환했다.
기존 `.video-controls__pill`은 공용 Select의 root `className`으로 승계한다.

```tsx
<Select
  className="video-controls__pill"
  items={plannerConfig.options.map((model) => ({ value: model, label: model }))}
  value={plannerConfig.model}
  onChange={(model) => void onPlannerChange(model)}
  ariaLabel={t("video.plannerModelTitle")}
/>
```

### WebSearchToggle

label variant만 switch semantics로 바뀌고 compact 아이콘 variant는 기존 button을
유지한다. 이는 동일 상태라도 사용 맥락과 조작 표면이 다르기 때문이다.

```tsx
if (variant === "label") {
  return (
    <Toggle
      checked={webSearchEnabled}
      onChange={setWebSearchEnabled}
      label={label}
      className="web-search-toggle web-search-toggle--label"
    />
  );
}
```

## controls.css 토큰 구조

### 사용 토큰

| 토큰 | 사용 위치 | 역할 |
|---|---|---|
| `--control-bg` | trigger, chip | 기본 control surface |
| `--control-hover` | trigger hover, active option, chip hover | 상호작용 surface |
| `--surface` | select popup color-mix | popup glass 기반색 |
| `--surface-3` | toggle track | off 상태 track |
| `--hairline-soft` | trigger, toggle, chip | 기본 경계선 |
| `--hairline` | hover/on/selected | 강조 경계선 |
| `--glass-line` | popup | glass 경계선 |
| `--text` | selected/hover text | 주 텍스트 |
| `--text-dim` | 기본 item/label | 보조 본문 텍스트 |
| `--text-muted` | metadata/caret/thumb | 저강도 텍스트 |
| `--accent-soft` | selected/on surface | 선택 배경 |
| `--accent-bright` | toggle thumb | 선택 전경 |
| `--mono` | metadata | 모델/비용 정보 서체 |
| `--radius` | trigger/list | 시스템 radius 파생 |
| `--shadow-strong` | popup | 떠 있는 listbox 깊이 |
| `--prism` | foil pseudo element | Generate hover 광택 |

### BEM-like naming 규칙

| 형태 | 예 | 의미 |
|---|---|---|
| block | `.ctl-select` | 공용 primitive root |
| element | `.ctl-select__trigger` | primitive 내부 구조 |
| state | `.is-open` | transient state |
| state | `.is-selected` | committed state |
| state | `.is-active` | navigation candidate |
| state | `.is-disabled` | interaction unavailable |
| compatibility block | `.option-group` | legacy public selector |
| feature scope | `.history-layout-toggle` | 소비처별 layout hook |

### Select 핵심 CSS

```css
.ctl-select__list {
  position: absolute;
  z-index: 40;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: color-mix(in srgb, var(--surface) 86%, transparent);
  border: 1px solid var(--glass-line);
  border-radius: calc(var(--radius) - 2px);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 12px 32px var(--shadow-strong);
}

.ctl-select__item.is-active {
  background: var(--control-hover);
  color: var(--text);
}

.ctl-select__item.is-selected {
  color: var(--text);
  background: var(--accent-soft);
}
```

### Toggle 핵심 CSS

```css
.ctl-toggle__track {
  width: 30px;
  height: 17px;
  border-radius: 999px;
  background: var(--surface-3);
  border: 1px solid var(--hairline-soft);
  position: relative;
}

.ctl-toggle.is-on .ctl-toggle__thumb {
  transform: translateX(13px);
  background: var(--accent-bright);
}
```

### Chip 핵심 CSS

```css
.ctl-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ctl-chip {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--hairline-soft);
  border-radius: 999px;
  background: var(--control-bg);
  overflow: hidden;
}

.ctl-chip.is-selected {
  background: var(--accent-soft);
  border-color: var(--hairline);
}
```

### foil-hover 제한

```css
.foil-hover::after {
  content: "";
  position: absolute;
  inset: -1px;
  z-index: -1;
  border-radius: inherit;
  background: var(--prism);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.foil-hover:hover::after,
.foil-hover:focus-visible::after {
  opacity: 0.42;
}
```

이 class는 모든 control의 일반 hover가 아니다. 시각적 위계가 높은 Generate
계열에만 적용하며, Select/Toggle/Chip은 각자의 낮은 강도 토큰을 사용한다.

## 검증 체크리스트

| 영역 | 확인 항목 | 기대 결과 |
|---|---|---|
| Segmented | 좌/우 방향키 | disabled 제외 순환 |
| Segmented | click | 외부 value 1회 변경 |
| Segmented | 기존 OptionGroup import | compile 및 동일 DOM class |
| Select | Enter/Space open | popup mount 및 `aria-expanded=true` |
| Select | Arrow navigation | active index 이동 |
| Select | Escape | commit 없이 close |
| Select | 외부 pointer | commit 없이 close |
| Select | disabled option | commit 차단 |
| Toggle | click/keyboard | boolean 반전 |
| Toggle | screen reader | switch와 checked 상태 노출 |
| Chip | body/remove | 서로 독립된 callback |
| CSS | dark/light theme | semantic token으로 동일 구조 유지 |
| CSS | focus-visible | prism/outline 피드백 확인 |
| 소비처 | persisted store | 기존 setter와 값 변화 없음 |
| 빌드 | `cd ui && npm run build` | production bundle 성공 |
