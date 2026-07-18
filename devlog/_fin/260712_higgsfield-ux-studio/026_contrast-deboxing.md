---
created: 2026-07-12
tags: [ima2-gen, phase, contrast, wcag, deboxing]
---

# Phase 026 — 색 대조 AA 정합 + 박스 분할 완화

사용자 지시(2026-07-12)로 020/025 뒤에 삽입된 phase. cxc-dev-uiux-design
(판단) + cxc-dev-frontend(§7 접근성 게이트, FE-CONVERGENCE-01) 대조 적용.

## 진단 (WCAG 계산 근거)

- `--text-faint #55555f` = 2.0~2.7:1 — 전면 AA 미달인데 의미 라벨 18곳에
  사용(설정 eyebrow, PROVIDER 헤더, 모델 섹션 타이틀, 내비 힌트 등).
- `--text-muted #7e7e8c` = 4.23/3.75 (surface2/3) — 상승면 AA 미달.
- `.settings-row`가 border+bg 박스 → 셸>섹션>카드>행 4중 중첩,
  QuotaCard 내부 박스-인-박스, 사이드바 노드 힌트 박스.

## 조치

1. `--text-muted` #7e7e8c → **#90909d** (surface3에서 4.76:1, 전면 AA 클리어).
2. faint를 **장식/비활성/플레이스홀더 전용**으로 재정의하고, 의미 라벨
   18곳을 muted로 승격 (Bohr 감사 전수 분류 26곳 기준: 의미 18 승격,
   장식 4 유지, 에이전트 CSS 4 스킵).
3. `image-model-select__subsection-title`의 `opacity: 0.7` 제거(합성 대조
   무효화 방지).
4. 디박스: `.settings-row`/`.settings-note` border+bg 제거 → 형제 간
   `--hairline-soft` 디바이더. `.quota-card` 동일 처치. `.sidebar__node-hint`
   플랫 텍스트화. 레이아웃 계약(grid/order/gap)은 보존.
5. 유지 결정: provider-card(그룹 유일 카드), 입력/셀렉트 경계
   (FE-A11Y-POLISH-01), 시맨틱 상태 컨테이너, 노드 오버레이 힌트.
   우측 패널/컴포저/갤러리/프롬프트 빌더 디박스는 명시적 이연.
6. 정책 명문화: 에이전트 레인은 **파일 불가침, 토큰은 전역 상속**(010 선례).

## Done — 2026-07-12 충족

- 대조 재계산: muted 6.23/5.82/5.37/4.76 (bg/surface/2/3) 전면 AA 통과.
- npm test 1133 pass 0 fail + ui build green.
- 실화면 검수 → `assets/026/settings-after.png` (쿼터 플랫, 헤더 가독,
  카드 위계 단일화 확인).

상태: **done** (2026-07-12)

## Diff-Level Record

- 커밋: `690073e`
- 비교 범위: `7c01ab7..690073e`
- 통계: **9 files, +33 / −37** (`git diff --stat 7c01ab7..690073e`)

| 파일 | + | − | diff-level 역할 |
|---|---:|---:|---|
| `ui/src/index.css` | 1 | 1 | `--text-muted` 토큰을 `#7e7e8c` → `#90909d`로 상향 |
| `ui/src/styles/canvas-accordion.css` | 6 | 11 | settings row/note 박스를 flat row + divider로 전환 |
| `ui/src/styles/canvas-viewer.css` | 11 | 9 | 의미 label의 faint 사용을 muted로 승격하고 연관 간격 보정 |
| `ui/src/styles/composer-flow.css` | 1 | 1 | 의미 text의 muted 토큰 사용 |
| `ui/src/styles/node-workspace.css` | 2 | 4 | sidebar node hint 박스를 inline text로 평탄화 |
| `ui/src/styles/prompt-builder-messages.css` | 2 | 2 | message 라벨의 faint → muted 승격 |
| `ui/src/styles/prompt-builder.css` | 2 | 2 | prompt builder 의미 label의 faint → muted 승격 |
| `ui/src/styles/provider-controls.css` | 3 | 3 | provider control 라벨/메타 대조 상향 |
| `ui/src/styles/quota-card.css` | 5 | 4 | surface card를 borderless flat quota row + divider로 전환 |

### Before → After Patterns

- `--text-muted: #7e7e8c` → `--text-muted: #90909d`; surface-3 기준
  3.75:1 → 4.76:1로 의미 텍스트의 AA 대조를 회복.
- 의미 label에 `--text-faint` 및 subsection `opacity: 0.7` →
  `--text-muted` 직접 사용; faint는 장식/비활성/플레이스홀더로 한정.
- `.settings-row`/`.settings-note` border + background + radius →
  `padding: 14px 2px` flat row + `--hairline-soft` sibling divider.
- `.quota-card` surface-2 박스 → provider 계층 안의 borderless flat row + divider.
- `.sidebar__node-hint` 별도 hint box → inline text; provider card, input/select,
  semantic state container는 필요한 경계로 유지.

## 전체 파일 변경표

`git diff --numstat 7c01ab7..690073e`의 실제 수치다. 이 phase는 CSS 9개
파일만 수정했으며 binary나 rename은 없다.

| # | 상태 | 파일 | + | − | 변경 종류 |
|---:|:---:|---|---:|---:|---|
| 1 | M | `ui/src/index.css` | 1 | 1 | muted token 명도 상승 |
| 2 | M | `ui/src/styles/canvas-accordion.css` | 6 | 11 | 설정 label 승격, note debox |
| 3 | M | `ui/src/styles/canvas-viewer.css` | 11 | 9 | 설정 label 승격, row divider 전환 |
| 4 | M | `ui/src/styles/composer-flow.css` | 1 | 1 | 의미 텍스트 faint→muted |
| 5 | M | `ui/src/styles/node-workspace.css` | 2 | 4 | sidebar hint debox |
| 6 | M | `ui/src/styles/prompt-builder-messages.css` | 2 | 2 | message label contrast 승격 |
| 7 | M | `ui/src/styles/prompt-builder.css` | 2 | 2 | builder label contrast 승격 |
| 8 | M | `ui/src/styles/provider-controls.css` | 3 | 3 | provider metadata contrast 승격 |
| 9 | M | `ui/src/styles/quota-card.css` | 5 | 4 | quota card debox + sibling divider |
| | | **합계** | **33** | **37** | **9 files changed** |

## 실제 diff 기록

### 전역 muted token

```diff
diff --git a/ui/src/index.css b/ui/src/index.css
index be5bec9..c48ab50 100644
--- a/ui/src/index.css
+++ b/ui/src/index.css
@@ -67,7 +67,7 @@
   --border-strong: #3d3d49;
   --text: #f4f4f6;
   --text-dim: #b6b6c2;
-  --text-muted: #7e7e8c;
+  --text-muted: #90909d;
   --text-faint: #55555f;
```

한 토큰 변경이지만 적용 범위는 전역이다. muted를 의미 라벨의 최저 등급으로
정의하고, 가장 밝은 일반 surface인 `--surface-3`에서도 4.5:1을 넘도록 값을
선택했다.

### Settings accordion

```diff
diff --git a/ui/src/styles/canvas-accordion.css b/ui/src/styles/canvas-accordion.css
index 5437d46..1357d88 100644
--- a/ui/src/styles/canvas-accordion.css
+++ b/ui/src/styles/canvas-accordion.css
@@ -108,7 +108,7 @@
 .settings-row .settings-eyebrow {
-  color: var(--text-faint);
+  color: var(--text-muted);
@@ -116,10 +116,7 @@
 .settings-note {
-  padding: 16px 18px;
-  border: 1px dashed var(--border);
-  border-radius: 16px;
-  background: var(--control-bg);
+  padding: 14px 2px;
 }
@@ -262,7 +259,7 @@
 .image-model-select__section-title {
-  color: var(--text-faint);
+  color: var(--text-muted);
@@ -292,10 +289,9 @@
 .image-model-select__subsection-title {
-  color: var(--text-faint);
+  color: var(--text-muted);
   font-family: var(--mono);
   font-size: 9px;
-  opacity: 0.7;
 }
@@ -320,7 +316,7 @@
 .image-model-select__item small {
-  color: var(--text-faint);
+  color: var(--text-muted);
@@ -343,7 +339,7 @@
 .settings-row__microcopy {
-  color: var(--text-faint);
+  color: var(--text-muted);
 }
```

`opacity: 0.7` 제거가 중요하다. CSS color 자체의 대조비가 통과해도 element
opacity가 적용되면 배경과 합성된 최종 색은 더 어두워진다. 의미 subsection
title은 muted 원색을 그대로 렌더링해 계산 가능한 계약을 유지한다.

### Settings viewer rows

```diff
diff --git a/ui/src/styles/canvas-viewer.css b/ui/src/styles/canvas-viewer.css
index 6c0107a..2c019e9 100644
--- a/ui/src/styles/canvas-viewer.css
+++ b/ui/src/styles/canvas-viewer.css
@@ -60,7 +60,7 @@
 .settings-eyebrow {
-  color: var(--text-faint);
+  color: var(--text-muted);
@@ -137,7 +137,7 @@
 .settings-mobile-nav__item small {
-  color: var(--text-faint);
+  color: var(--text-muted);
@@ -181,7 +181,7 @@
 .settings-nav__item small {
-  color: var(--text-faint);
+  color: var(--text-muted);
@@ -222,7 +222,7 @@
 .settings-section__header p {
-  color: var(--text-faint);
+  color: var(--text-muted);
@@ -237,10 +237,13 @@
 .settings-row {
   display: grid;
   grid-template-columns: minmax(0, 1fr);
   gap: 8px;
-  padding: 12px 14px;
-  border: 1px solid var(--border);
-  border-radius: 8px;
-  background: var(--surface);
+  padding: 14px 2px;
+}
+
+.settings-row + .settings-row,
+.settings-row + .settings-note,
+.settings-note + .settings-row {
+  border-top: 1px solid var(--hairline-soft);
 }
```

grid와 gap은 유지하고 visual container만 제거했다. sibling combinator는 첫 행에
선을 그리지 않고 실제 경계가 필요한 인접 관계에만 divider를 만든다. note와
row가 섞인 경우도 두 방향을 명시해 구획 누락을 막는다.

### Quota rows

```diff
diff --git a/ui/src/styles/quota-card.css b/ui/src/styles/quota-card.css
index 93457bd..1c25e24 100644
--- a/ui/src/styles/quota-card.css
+++ b/ui/src/styles/quota-card.css
@@ -6,10 +6,11 @@
 .quota-card {
-  padding: 10px 12px;
-  border: 1px solid var(--border);
-  border-radius: 10px;
-  background: var(--surface-2);
+  padding: 10px 2px;
+}
+
+.quota-card + .quota-card {
+  border-top: 1px solid var(--hairline-soft);
 }
```

class 이름은 호환성을 위해 유지하지만 시각적으로는 더 이상 card가 아니다.
provider-card가 그룹 경계를 담당하고, quota 항목들은 그 내부의 반복 row다.

## WCAG AA 대조 매트릭스

계산은 WCAG 상대 휘도 공식 `(Llighter + 0.05) / (Ldarker + 0.05)`를 사용했다.
아래 값은 불투명 sRGB 전경과 배경의 계산값이며 소수 둘째 자리로 반올림했다.
일반 크기 의미 텍스트의 기준은 4.5:1이다.

| 전경 토큰 | 실제 값 | `--bg` #0b0b0f | `--surface` #14141a | `--surface-2` #1c1c23 | `--surface-3` #26262f | 판정 |
|---|---|---:|---:|---:|---:|---|
| `--text` | `#f4f4f6` | 17.88 | 16.70 | 15.42 | 13.65 | 전면 AA/AAA |
| `--text-dim` | `#b6b6c2` | 9.78 | 9.14 | 8.44 | 7.47 | 전면 AA/AAA |
| `--text-muted` after | `#90909d` | 6.23 | 5.82 | 5.37 | 4.76 | 전면 AA |
| `--text-muted` before | `#7e7e8c` | 4.91 | 4.59 | 4.23 | 3.75 | bg/surface만 AA |
| `--text-faint` | `#55555f` | 2.67 | 2.49 | 2.30 | 2.04 | 의미 텍스트 사용 금지 |

### 색상별 사용 판정

| 값 | 허용 배경 | 허용 용도 | 금지 용도 |
|---|---|---|---|
| `#f4f4f6` | 네 surface 전체 | 주요 제목, 값, 본문 | 비활성 표현 |
| `#b6b6c2` | 네 surface 전체 | 설명 본문, secondary copy | 장식 요소 남용 |
| `#90909d` | 네 surface 전체 | eyebrow, nav hint, metadata, microcopy | disabled를 의미하는 유일한 신호 |
| `#7e7e8c` | 역사적 값 | Phase 026 이후 신규 사용 없음 | surface-2/3의 일반 텍스트 |
| `#55555f` | 대비 요건 없는 장식 | placeholder, 비활성, decorative mark | label, navigation, 도움말, 상태, 비용 |

`--hairline-soft`와 translucent control 색은 텍스트 전경이 아니므로 위 표의
텍스트 AA 판정 대상이 아니다. 입력 경계나 focus indicator는 별도 non-text
contrast와 상태 식별 계약으로 평가한다.

### 의미 라벨 승격 목록

이 diff에서 확인되는 대표 승격은 settings eyebrow, mobile navigation hint,
desktop navigation hint, section description, image model section title,
subsection title, model item description, settings microcopy다. 나머지 변경 파일의
provider metadata와 prompt-builder label도 같은 원칙을 따른다. 토큰만 밝게 하는
것과 faint consumer를 muted로 옮기는 작업을 함께 해야 실제 의미 텍스트가
일관되게 통과한다.

## 박스 제거 상세

### Settings row: card에서 divider row로

Before:

```css
.settings-row {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
```

After:

```css
.settings-row {
  padding: 14px 2px;
}

.settings-row + .settings-row,
.settings-row + .settings-note,
.settings-note + .settings-row {
  border-top: 1px solid var(--hairline-soft);
}
```

행 자체가 독립 객체가 아니라 한 설정 section의 반복 항목이므로 네 면의 box
signal을 제거했다. vertical padding은 14px로 유지해 클릭/읽기 밀도는 급격히
줄이지 않았고, horizontal padding만 2px로 낮춰 상위 section 정렬선에 맞췄다.

### Settings note: dashed callout에서 평면 설명으로

Before:

```css
.settings-note {
  padding: 16px 18px;
  border: 1px dashed var(--border);
  border-radius: 16px;
  background: var(--control-bg);
}
```

After:

```css
.settings-note {
  padding: 14px 2px;
}
```

note가 warning이나 action-required 상태가 아니라 설명 문장이라면 dashed border는
시맨틱 강도를 과장한다. 일반 row와 같은 수평 리듬에 놓고 인접 divider가 구획을
담당하게 했다.

### Quota card: nested card에서 provider 내부 row로

Before:

```css
.quota-card {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}
```

After:

```css
.quota-card {
  padding: 10px 2px;
}

.quota-card + .quota-card {
  border-top: 1px solid var(--hairline-soft);
}
```

quota는 provider라는 상위 entity의 속성이다. 각 quota에 다시 border, radius,
surface를 부여하면 provider-card 안에 quota-card가 중첩되어 두 계층이 같은
시각 무게를 갖는다. after는 provider만 entity card로 읽히게 한다.

### Sidebar node hint

이 phase의 `node-workspace.css` 변경은 hint의 별도 background/border treatment를
제거하고 inline text로 평탄화했다. 힌트는 작업 공간의 독립 객체가 아니라
현재 node context를 보조하는 문장이다. 단, node overlay처럼 공간적으로 떠 있고
canvas와 겹치는 힌트는 배경 없이는 읽을 수 있으므로 이번 debox 대상이 아니다.

### 의도적으로 유지한 박스

- `provider-card`: provider는 설정의 최상위 반복 entity이므로 카드 경계를 유지한다.
- input/select: 상호작용 가능 영역과 값의 경계가 필요하다.
- error/success/status container: 상태 의미와 범위를 전달해야 한다.
- canvas overlay hint: 이미지/노드 위 가변 배경에서 텍스트를 보호한다.
- modal/popover: 다른 elevation layer임을 공간적으로 표시한다.

## 시각 위계 원칙

핵심 규칙은 **“Providers만 card, 나머지는 divider rows”**다.

### 계층 모델

| 단계 | 시각 문법 | 예시 |
|---:|---|---|
| 1 | page/shell surface | Settings workspace |
| 2 | section spacing + heading | Providers, General, Canvas |
| 3 | entity card | 개별 provider |
| 4 | divider row | quota, model option, 일반 setting |
| 5 | inline metadata | hint, microcopy, cost/status detail |

모든 단계에 background, border, radius를 주면 계층이 아니라 상자 수만 늘어난다.
이 원칙은 entity에만 폐쇄된 윤곽을 주고, 속성과 반복 항목에는 open row와 얇은
divider를 사용한다. 사용자는 먼저 provider를 스캔하고 그 안에서 quota와 설정을
순서대로 읽는다.

### Divider 적용 규칙

1. 첫 row에는 top border를 만들지 않는다.
2. 형제 row 사이에만 `--hairline-soft`를 사용한다.
3. row와 note가 교차해도 하나의 divider만 보이게 adjacent selector를 쓴다.
4. divider는 hierarchy를 보조하며 heading spacing을 대체하지 않는다.
5. interactive control 자체의 border는 divider와 다른 계약이므로 유지한다.
6. 상태 변화는 색만으로 전달하지 않고 text/icon/label을 함께 쓴다.

### Contrast와 deboxing의 결합

박스를 제거하면 텍스트 주변의 밝은 surface도 사라질 수 있으므로 전경 토큰은
실제 최저 배경까지 고려해야 한다. 이번 phase가 muted 상향과 deboxing을 같은
커밋에서 처리한 이유다. `#90909d`는 bg부터 surface-3까지 모두 통과하므로 row가
어느 surface에 놓여도 의미 label의 AA 계약이 유지된다.

### 후속 작업 계약

- 새 provider entity는 provider-card 문법을 사용할 수 있다.
- provider 내부 신규 속성은 기본적으로 divider row다.
- 별도 card가 필요하면 독립 entity, interaction boundary, semantic state 중
  무엇을 표현하는지 설명할 수 있어야 한다.
- faint는 placeholder/disabled/decorative 전용이며 의미 label에 사용하지 않는다.
- opacity로 muted text를 다시 낮추지 않는다.
- card 제거 시 layout grid, order, gap, hit target은 별도 변경 근거 없이 바꾸지 않는다.
