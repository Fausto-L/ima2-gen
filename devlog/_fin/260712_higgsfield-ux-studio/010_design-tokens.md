---
created: 2026-07-12
tags: [ima2-gen, phase, design-tokens]
---

# Phase 010 — 토큰/질감 이식 + 다크 단일화

스펙: `001_design-language.md`. 이 phase는 **값 교체와 레이어 추가만** 한다.
컴포넌트 구조, 마크업, 동작은 건드리지 않는다. 가장 명확하고 되돌리기 쉬운
단위라 첫 phase.

2026-07-12 결정: **테마는 다크 단일로 간다.** 라이트 테마와 `ThemeToggle`을
제거하고 팔레트 하나만 유지한다(사용자 결정 — 90 미결정 원장에서 해소).
미디어-퍼스트 스튜디오에서 라이트는 유지 비용만 있고 쓰임이 없다.

## 범위

1. `ui/src/index.css` 토큰 값 교체: `--bg #0b0b0f`, surface/border 계열을
   사이트 팔레트(`#14141a`/`#15151c`/`#26262f`)로. 토큰 이름은 유지.
2. 신규 토큰 추가: `--prism`, `--chrome`, `--glass`, `--glass-line`
   (이 phase에서는 정의만, 소비는 020부터).
3. 앱 셸 루트에 노이즈 오버레이 + 듀얼 radial glow 레이어. 노드 캔버스·
   이미지 뷰어·비디오 재생 영역 위에서는 비활성.
4. 서체 교체: Clash Display(디스플레이) / Satoshi+Pretendard(본문) /
   IBM Plex Mono(메타·비용·상태). 사이트와 동일 소스 self-host.
5. 다크 단일화: `:root[data-theme="light"]` 블록 + `ThemeToggle` +
   테마 persistence 키 제거. `data-theme` 분기 소비처 정리.

## 명시적 제외

- 컴포넌트별 스타일 리라이트(→ 020), 레이아웃 변경(→ 030).

## Done 기준 — 2026-07-12 전부 충족

- `cd ui && npm run build` + 기존 테스트 green.
  → typecheck/typecheck:tests PASS, npm test 1133 pass 0 fail, vite build OK.
- 클래식/노드/에이전트/설정 4면 스크린샷 → `assets/010/` (라이브 서버 실검수).
- 잔재 0건: `rg 'data-theme|ThemeToggle|themeFamily|ima2:theme|Outfit|Geist' ui/src ui/index.html`.
- 노이즈 레이어는 fixed 오버레이 + 불투명 패널 커버 방식이라 스크롤 레이어
  영향 없음(합성 1회). 워커 증거: `.codexclaw/evidence/260712-phase-010-theme-removal.md`.

구현 노트: 테마는 라이트만이 아니라 **5패밀리(default/gpt/claude/gemini/grok)
시스템 전체**를 제거했다(themes.css 467→82줄). 폰트는 Fontshare/Google에서
woff2를 받아 `ui/public/fonts/` self-host 7종(사이트는 CDN 유지 — 사이트
측 참고사항). index.html 테마 부트스트랩 스크립트 삭제, meta color-scheme
추가. 계획 감사는 sol 리뷰어 2라운드(블로커 8건 수용) 후 진행.

상태: **done** (2026-07-12)

## Diff-Level Record

- 커밋: `67b2e01`
- 범위: `dc09410..67b2e01`
- 기준선: `dc09410`은 Phase 010 적용 전(pre-phase) baseline이다.
- 집계: 26 files changed, +170 / -761, binary fonts 7개 추가.

| 경로 | 작업 | + / - |
|---|---|---:|
| `devlog/_plan/README.md` | MODIFY | +2 / -1 |
| `structure/01-file-function-map.md` | MODIFY | +5 / -5 |
| `tests/node-ui-contract.test.js` | MODIFY | +11 / -7 |
| `ui/index.html` | MODIFY | +21 / -21 |
| `ui/public/fonts/ClashDisplay-600.woff2` | NEW | binary |
| `ui/public/fonts/ClashDisplay-700.woff2` | NEW | binary |
| `ui/public/fonts/IBMPlexMono-400.woff2` | NEW | binary |
| `ui/public/fonts/IBMPlexMono-500.woff2` | NEW | binary |
| `ui/public/fonts/Satoshi-400.woff2` | NEW | binary |
| `ui/public/fonts/Satoshi-500.woff2` | NEW | binary |
| `ui/public/fonts/Satoshi-700.woff2` | NEW | binary |
| `ui/src/App.tsx` | MODIFY | +1 / -28 |
| `ui/src/components/SettingsWorkspace.tsx` | MODIFY | +0 / -10 |
| `ui/src/components/ThemeToggle.tsx` | DELETE | +0 / -117 |
| `ui/src/i18n/en.json` | MODIFY | +1 / -3 |
| `ui/src/i18n/ko.json` | MODIFY | +1 / -3 |
| `ui/src/index.css` | MODIFY | +98 / -53 |
| `ui/src/store/persistenceRegistry.ts` | MODIFY | +17 / -24 |
| `ui/src/store/storePersistence.ts` | MODIFY | +0 / -32 |
| `ui/src/store/storeTypes.ts` | MODIFY | +0 / -11 |
| `ui/src/store/storeUIImpl.ts` | MODIFY | +1 / -14 |
| `ui/src/store/useAppStore.ts` | MODIFY | +1 / -19 |
| `ui/src/styles/sidebar.css` | MODIFY | +2 / -2 |
| `ui/src/styles/themes.css` | MODIFY | +9 / -394 |
| `ui/src/styles/viewer-workflow.css` | MODIFY | +0 / -6 |
| `ui/src/types.ts` | MODIFY | +0 / -11 |

Before → After 핵심 패턴:

- `ThemeToggle`과 테마 선택/persistence 상태 → 다크 단일 visual identity.
- 5개 테마 패밀리를 담던 `themes.css` → canvas/minimap용 최소 토큰만 유지.
- 평면 단색 팔레트 → `--prism`, `--chrome`, `--glass`, glow/grain을 포함한 site-texture 토큰.
- Outfit/Geist 및 외부 서체 의존 → Satoshi/Clash Display/IBM Plex Mono 7종 self-host.

## 전체 파일 변경표

아래 표는 `git diff --numstat dc09410..67b2e01`과
`git diff --name-status dc09410..67b2e01`을 결합한 실제 변경 목록이다.
바이너리 WOFF2는 Git numstat이 `-/-`로 표시하므로 임의의 줄 수를 부여하지 않는다.

| # | 상태 | 경로 | 추가 | 삭제 | 변경의 의미 |
|---:|:---:|---|---:|---:|---|
| 1 | M | `devlog/_plan/README.md` | 2 | 1 | Phase 010 상태와 로드맵 연결 갱신 |
| 2 | M | `structure/01-file-function-map.md` | 5 | 5 | 제거된 테마 모듈/상태 계약 반영 |
| 3 | M | `tests/node-ui-contract.test.js` | 11 | 7 | 단일 다크 테마 계약으로 테스트 수정 |
| 4 | M | `ui/index.html` | 21 | 21 | 테마 bootstrap 제거, 폰트 preload와 dark 메타 추가 |
| 5 | A | `ui/public/fonts/ClashDisplay-600.woff2` | binary | binary | display 600 self-host |
| 6 | A | `ui/public/fonts/ClashDisplay-700.woff2` | binary | binary | display 700 self-host |
| 7 | A | `ui/public/fonts/IBMPlexMono-400.woff2` | binary | binary | mono 400 self-host |
| 8 | A | `ui/public/fonts/IBMPlexMono-500.woff2` | binary | binary | mono 500 self-host |
| 9 | A | `ui/public/fonts/Satoshi-400.woff2` | binary | binary | body 400 self-host |
| 10 | A | `ui/public/fonts/Satoshi-500.woff2` | binary | binary | body 500 self-host |
| 11 | A | `ui/public/fonts/Satoshi-700.woff2` | binary | binary | body 700 self-host |
| 12 | M | `ui/src/App.tsx` | 1 | 28 | DOM dataset 테마 동기화 effect 제거 |
| 13 | M | `ui/src/components/SettingsWorkspace.tsx` | 0 | 10 | 설정 화면 ThemeToggle 슬롯 제거 |
| 14 | D | `ui/src/components/ThemeToggle.tsx` | 0 | 117 | mode/family 선택 UI 전체 삭제 |
| 15 | M | `ui/src/i18n/en.json` | 1 | 3 | 테마 선택 문구 제거 |
| 16 | M | `ui/src/i18n/ko.json` | 1 | 3 | 테마 선택 문구 제거 |
| 17 | M | `ui/src/index.css` | 98 | 53 | 단일 팔레트, 서체, 질감 및 효과 토큰 도입 |
| 18 | M | `ui/src/store/persistenceRegistry.ts` | 17 | 24 | theme 저장 키/registry 항목 제거 |
| 19 | M | `ui/src/store/storePersistence.ts` | 0 | 32 | theme preference 해석/복원 제거 |
| 20 | M | `ui/src/store/storeTypes.ts` | 0 | 11 | theme state/action 타입 제거 |
| 21 | M | `ui/src/store/storeUIImpl.ts` | 1 | 14 | theme setter 구현과 import 제거 |
| 22 | M | `ui/src/store/useAppStore.ts` | 1 | 19 | store 초기 theme state/action wiring 제거 |
| 23 | M | `ui/src/styles/sidebar.css` | 2 | 2 | 신규 토큰에 맞춘 sidebar 색상 조정 |
| 24 | M | `ui/src/styles/themes.css` | 9 | 394 | 5-family × light/dark 매트릭스 제거 |
| 25 | M | `ui/src/styles/viewer-workflow.css` | 0 | 6 | theme selector 분기 제거 |
| 26 | M | `ui/src/types.ts` | 0 | 11 | ThemePreference/ThemeFamily 상수와 타입 제거 |
| | **합계** | **26 files** | **170** | **761** | binary 7개 포함 |

## 핵심 변경 상세

### 1. 다중 테마 매트릭스의 삭제

요청 명령 `git diff dc09410..67b2e01 -- ui/src/styles/themes.css | head -100`
결과를 그대로 기록한다.

```diff
diff --git a/ui/src/styles/themes.css b/ui/src/styles/themes.css
index ac99953..0ba95cf 100644
--- a/ui/src/styles/themes.css
+++ b/ui/src/styles/themes.css
@@ -1,399 +1,14 @@
 /* ============================================================================
- * Default family canvas tokens (Phase 3 prep — extracted from former NodeCanvas
- * hardcoded values so React Flow can read CSS vars instead of mode-branching).
- * Same values for default family preserve current visual output exactly.
+ * Canvas / minimap tokens — single dark theme (Phase 010: theme families and
+ * light mode removed; values aligned to the site palette #0b0b0f).
  * ============================================================================ */
-:root,
-:root[data-theme="dark"],
-:root[data-theme-mode="dark"][data-theme-family="default"] {
-  --canvas-grid: #2a2a2a;
-  --minimap-mask: rgba(10, 10, 10, 0.7);
-  --minimap-node-fill: #f0f0f0;
-  --minimap-node-stroke: #1a1a1a;
-  --minimap-bg: #141414;
-  --minimap-border: #2a2a2a;
-}
-:root[data-theme="light"],
-:root[data-theme-mode="light"][data-theme-family="default"] {
-  --canvas-grid: #d9dee6;
-  --minimap-mask: rgba(246, 247, 251, 0.72);
-  --minimap-node-fill: #1f2430;
-  --minimap-node-stroke: #ffffff;
-  --minimap-bg: #ffffff;
-  --minimap-border: #d9dee6;
-}
-
-/* ============================================================================
- * GPT family — current ChatGPT (2026): monochrome, no green accent.
- * ============================================================================ */
-:root[data-theme-mode="dark"][data-theme-family="gpt"] {
-  --bg: #212121;
-  --surface: #2f2f2f;
-  --surface-2: #383838;
-  --surface-3: #444444;
-  --border: #4a4a4a;
-  --border-strong: #5f5f5f;
-  --text: #ececec;
-  --text-dim: #b4b4b4;
-  --text-muted: #9b9b9b;
-  --text-faint: #7a7a7a;
-  --canvas-muted: #5f5f5f;
-  --accent: #ffffff;
-  --accent-bright: #ffffff;
-  --accent-soft: rgba(255, 255, 255, 0.10);
-  --accent-ink: #0d0d0d;
-  --accent-shadow: rgba(0, 0, 0, 0.28);
-  --focus-ring: rgba(255, 255, 255, 0.18);
-  --hairline: rgba(255, 255, 255, 0.14);
-  --hairline-soft: rgba(255, 255, 255, 0.05);
-  --control-bg: rgba(255, 255, 255, 0.06);
-  --control-hover: rgba(255, 255, 255, 0.10);
-  --scrim: rgba(0, 0, 0, 0.6);
-  --scrim-strong: rgba(0, 0, 0, 0.78);
-  --caption-scrim: rgba(0, 0, 0, 0.85);
-  --chip-scrim: rgba(0, 0, 0, 0.75);
-  --on-scrim: #ececec;
-  --shadow-soft: rgba(0, 0, 0, 0.22);
-  --shadow-strong: rgba(0, 0, 0, 0.36);
-  --green: #22c55e;
-  --amber: #f59e0b;
-  --red: #ef4444;
-  --blue: #4a9eff;
-  --radius: 10px;
-  --font: "Söhne", "Inter", system-ui, sans-serif;
-  --mono: "Geist Mono", "SFMono-Regular", monospace;
-  --canvas-grid: #3a3a3a;
-  --minimap-mask: rgba(33, 33, 33, 0.72);
-  --minimap-node-fill: #ececec;
-  --minimap-node-stroke: #212121;
-  --minimap-bg: #2f2f2f;
-  --minimap-border: #4a4a4a;
-  color-scheme: dark;
-}
-:root[data-theme-mode="light"][data-theme-family="gpt"] {
-  --bg: #ffffff;
-  --surface: #f7f7f8;
-  --surface-2: #ececec;
-  --surface-3: #e3e3e3;
-  --border: #e5e5e5;
-  --border-strong: #cccccc;
-  --text: #0d0d0d;
-  --text-dim: #5d5d5d;
-  --text-muted: #737373;
-  --text-faint: #8e8e8e;
-  --canvas-muted: #b0b0b0;
-  --accent: #0d0d0d;
-  --accent-bright: #000000;
-  --accent-soft: rgba(13, 13, 13, 0.06);
-  --accent-ink: #ffffff;
-  --accent-shadow: rgba(13, 13, 13, 0.12);
-  --focus-ring: rgba(13, 13, 13, 0.18);
-  --hairline: rgba(13, 13, 13, 0.14);
-  --hairline-soft: rgba(13, 13, 13, 0.05);
-  --control-bg: rgba(13, 13, 13, 0.04);
```

이 hunk는 단순 색상 정리가 아니다. CSS selector가 런타임 상태 머신 역할을
하던 구조를 폐기한 것이다. 이전에는 mode와 family의 곱집합마다 동일한 의미의
토큰을 다시 정의했다. 이후에는 `:root`가 제품의 유일한 시각 계약이며,
`themes.css`에는 React Flow canvas/minimap처럼 별도 소비자가 필요한 최소 토큰만
남는다. 테마별 예외를 제거함으로써 새 컴포넌트가 어느 family에서 깨지는지
확인해야 하는 테스트 차원도 함께 사라졌다.

### 2. 전역 토큰과 self-host font 도입

요청 명령 `git diff dc09410..67b2e01 -- ui/src/index.css | head -120`의
실제 출력이다.

```diff
diff --git a/ui/src/index.css b/ui/src/index.css
index 6f63da0..5f50d09 100644
--- a/ui/src/index.css
+++ b/ui/src/index.css
@@ -1,5 +1,55 @@
 @import "tailwindcss";

+@font-face {
+  font-family: "Clash Display";
+  src: url("/fonts/ClashDisplay-600.woff2") format("woff2");
+  font-weight: 600;
+  font-display: swap;
+  font-style: normal;
+}
+@font-face {
+  font-family: "Clash Display";
+  src: url("/fonts/ClashDisplay-700.woff2") format("woff2");
+  font-weight: 700;
+  font-display: swap;
+  font-style: normal;
+}
+@font-face {
+  font-family: "Satoshi";
+  src: url("/fonts/Satoshi-400.woff2") format("woff2");
+  font-weight: 400;
+  font-display: swap;
+  font-style: normal;
+}
+@font-face {
+  font-family: "Satoshi";
+  src: url("/fonts/Satoshi-500.woff2") format("woff2");
+  font-weight: 500;
+  font-display: swap;
+  font-style: normal;
+}
+@font-face {
+  font-family: "Satoshi";
+  src: url("/fonts/Satoshi-700.woff2") format("woff2");
+  font-weight: 700;
+  font-display: swap;
+  font-style: normal;
+}
+@font-face {
+  font-family: "IBM Plex Mono";
+  src: url("/fonts/IBMPlexMono-400.woff2") format("woff2");
+  font-weight: 400;
+  font-display: swap;
+  font-style: normal;
+}
+@font-face {
+  font-family: "IBM Plex Mono";
+  src: url("/fonts/IBMPlexMono-500.woff2") format("woff2");
+  font-weight: 500;
+  font-display: swap;
+  font-style: normal;
+}

 *,
 *::before,
 *::after {
@@ -8,25 +58,24 @@
   padding: 0;
 }

-:root,
-:root[data-theme="dark"] {
-  --bg: #0a0a0a;
-  --surface: #141414;
-  --surface-2: #1c1c1c;
-  --surface-3: #2a2a2a;
-  --border: #2a2a2a;
-  --border-strong: #444;
-  --text: #e8e8e8;
-  --text-dim: #888;
-  --text-muted: #888;
-  --text-faint: #555;
-  --canvas-muted: #333;
-  --accent: #f0f0f0;
+:root {
+  --bg: #0b0b0f;
+  --surface: #14141a;
+  --surface-2: #1c1c23;
+  --surface-3: #26262f;
+  --border: #26262f;
+  --border-strong: #3d3d49;
+  --text: #f4f4f6;
+  --text-dim: #b6b6c2;
+  --text-muted: #7e7e8c;
+  --text-faint: #55555f;
+  --canvas-muted: #33333c;
+  --accent: #f0f0f4;
   --accent-bright: #fff;
-  --accent-soft: rgba(255, 255, 255, 0.1);
-  --accent-ink: #0a0a0a;
+  --accent-soft: rgba(207, 210, 221, 0.1);
+  --accent-ink: #0b0b0f;
   --accent-shadow: rgba(255, 255, 255, 0.1);
-  --focus-ring: rgba(255, 255, 255, 0.08);
+  --focus-ring: rgba(122, 215, 255, 0.35);
   --hairline: rgba(255, 255, 255, 0.16);
   --hairline-soft: rgba(255, 255, 255, 0.04);
   --control-bg: rgba(255, 255, 255, 0.03);
@@ -43,45 +92,41 @@
   --red: #ef4444;
   --blue: #4a9eff;
   --radius: 10px;
-  --font: "Outfit", sans-serif;
-  --mono: "Geist Mono", monospace;
+  --font: "Satoshi", "Pretendard Variable", system-ui, sans-serif;
+  --font-display: "Clash Display", "Pretendard Variable", system-ui, sans-serif;
+  --mono: "IBM Plex Mono", "SF Mono", Menlo, monospace;
+  --prism: linear-gradient(100deg, #ff5adf 0%, #7ad7ff 28%, #ffd166 55%, #b28dff 78%, #7ad7ff 100%);
+  --chrome: linear-gradient(180deg, #ffffff 0%, #c8ccd8 35%, #6f7484 60%, #e8eaf1 100%);
+  --glass: rgba(255, 255, 255, 0.04);
+  --glass-line: rgba(255, 255, 255, 0.1);
   color-scheme: dark;
 }

-:root[data-theme="light"] {
-  --bg: #f6f7fb;
```

서체는 역할별로 분리되었다. Clash Display는 큰 제목과 브랜드 순간,
Satoshi는 긴 UI 본문과 컨트롤, IBM Plex Mono는 비용·상태·provider metadata를
담는다. 모든 `@font-face`에 `font-display: swap`을 지정해 파일 다운로드가
렌더링을 막지 않으며, 시스템 fallback을 각 토큰에 남겨 자산 실패 시에도
레이아웃과 텍스트 접근성을 유지한다.

### 3. ThemeToggle 컴포넌트 전체 삭제

```diff
diff --git a/ui/src/components/ThemeToggle.tsx b/ui/src/components/ThemeToggle.tsx
deleted file mode 100644
index a45c718..0000000
--- a/ui/src/components/ThemeToggle.tsx
+++ /dev/null
@@ -1,117 +0,0 @@
-import { useEffect, useRef, useState } from "react";
-import { useAppStore } from "../store/useAppStore";
-import { useI18n } from "../i18n";
-import { THEME_FAMILIES, type ThemeFamily, type ThemePreference } from "../types";
-
-const MODE_OPTIONS: ThemePreference[] = ["system", "dark", "light"];
-
-export function ThemeToggle() {
-  const { t } = useI18n();
-  const theme = useAppStore((s) => s.theme);
-  const setTheme = useAppStore((s) => s.setTheme);
-  const themeFamily = useAppStore((s) => s.themeFamily);
-  const setThemeFamily = useAppStore((s) => s.setThemeFamily);
-
-  const [familyOpen, setFamilyOpen] = useState(false);
-  const familyRef = useRef<HTMLDivElement>(null);
-
-  useEffect(() => {
-    if (!familyOpen) return;
-    const onClickOutside = (e: MouseEvent) => {
-      if (!familyRef.current) return;
-      if (!familyRef.current.contains(e.target as Node)) {
-        setFamilyOpen(false);
-      }
-    };
-    const onKey = (e: KeyboardEvent) => {
-      if (e.key === "Escape") setFamilyOpen(false);
-    };
-    document.addEventListener("mousedown", onClickOutside);
-    document.addEventListener("keydown", onKey);
-    return () => {
-      document.removeEventListener("mousedown", onClickOutside);
-      document.removeEventListener("keydown", onKey);
-    };
-  }, [familyOpen]);
-
-  const familyLabel = (family: ThemeFamily) => t(`theme.family.${family}`);
-
-  return (
-    <div className="theme-toggle" aria-label={t("theme.label")}>
-      <div className="theme-toggle__row">
-        <span className="theme-toggle__label" id="theme-style-label">
-          {t("theme.styleLabel")}
-        </span>
-        <div className="theme-toggle__family" ref={familyRef}>
-          <button
-            type="button"
-            className="theme-toggle__family-trigger"
-            aria-haspopup="listbox"
-            aria-expanded={familyOpen}
-            aria-labelledby="theme-style-label"
-            onClick={() => setFamilyOpen((v) => !v)}
-          >
-            <span
-              className={`theme-toggle__family-dot theme-toggle__family-dot--${themeFamily}`}
-              aria-hidden="true"
-            />
-            <span className="theme-toggle__family-name">{familyLabel(themeFamily)}</span>
-            <span className="theme-toggle__family-caret" aria-hidden="true">
-              ▾
-            </span>
-          </button>
-          {familyOpen ? (
-            <ul className="theme-toggle__family-menu" role="listbox" aria-labelledby="theme-style-label">
-              {THEME_FAMILIES.map((family) => (
-                <li key={family} role="none">
-                  <button
-                    type="button"
-                    role="option"
-                    aria-selected={themeFamily === family}
-                    className={`theme-toggle__family-option ${
-                      themeFamily === family ? "is-active" : ""
-                    }`}
-                    onClick={() => {
-                      setThemeFamily(family);
-                      setFamilyOpen(false);
-                    }}
-                  >
-                    <span
-                      className={`theme-toggle__family-dot theme-toggle__family-dot--${family}`}
-                      aria-hidden="true"
-                    />
-                    <span className="theme-toggle__family-name">{familyLabel(family)}</span>
-                  </button>
-                </li>
-              ))}
-            </ul>
-          ) : null}
-        </div>
-      </div>
-
-      <div className="theme-toggle__row">
-        <span className="theme-toggle__label" id="theme-mode-label">
-          {t("theme.modeLabel")}
-        </span>
-        <div className="theme-toggle__mode" role="group" aria-labelledby="theme-mode-label">
-          {MODE_OPTIONS.map((option) => (
-            <button
-              key={option}
-              type="button"
-              className={`theme-toggle__btn ${theme === option ? "is-active" : ""}`}
-              onClick={() => setTheme(option)}
-              aria-pressed={theme === option}
-              title={t(`theme.${option}`)}
-            >
-              {t(`theme.${option}`)}
-            </button>
-          ))}
-        </div>
-      </div>
-    </div>
-  );
-}
```

삭제 범위에는 버튼 JSX만이 아니라 click-outside listener, Escape 처리,
ARIA listbox, mode group, store selector 네 개와 번역 키 접근이 모두 포함된다.
단일 테마에서는 이 복잡성이 사용자 가치를 만들지 않으므로 컴포넌트를 숨기지
않고 삭제해 죽은 상태와 이벤트 listener까지 제거했다.

### 4. HTML bootstrap 제거와 폰트 preload

```diff
diff --git a/ui/index.html b/ui/index.html
index df24285..c1d1db3 100644
--- a/ui/index.html
+++ b/ui/index.html
@@ -7,33 +7,33 @@
     />
     <title>Image Gen</title>
+    <meta name="color-scheme" content="dark" />
     <link rel="icon" type="image/svg+xml"
-      href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230a0a0a'/><circle cx='16' cy='16' r='7' fill='none' stroke='%23ffffff' stroke-width='2.2'/><circle cx='16' cy='16' r='2.4' fill='%23ffffff'/></svg>"
+      href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230b0b0f'/><circle cx='16' cy='16' r='7' fill='none' stroke='%23ffffff' stroke-width='2.2'/><circle cx='16' cy='16' r='2.4' fill='%23ffffff'/></svg>"
     />
-    <link rel="preconnect" href="https://fonts.googleapis.com" />
-    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
-    <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
-    <script>
-      (() => {
-        try {
-          const stored = localStorage.getItem("ima2:theme");
-          const preferred = window.matchMedia("(prefers-color-scheme: light)").matches
-            ? "light"
-            : "dark";
-          const resolved = stored === "light" || stored === "dark" ? stored : preferred;
-          document.documentElement.dataset.theme = resolved;
-          document.documentElement.style.colorScheme = resolved;
-        } catch {
-          document.documentElement.dataset.theme = "dark";
-          document.documentElement.style.colorScheme = "dark";
-        }
-      })();
-    </script>
+    <link rel="preload" href="/fonts/Satoshi-400.woff2" as="font" type="font/woff2" crossorigin />
+    <link rel="preload" href="/fonts/ClashDisplay-600.woff2" as="font" type="font/woff2" crossorigin />
+    <link rel="preload" href="/fonts/IBMPlexMono-400.woff2" as="font" type="font/woff2" crossorigin />
   </head>
```

초기 inline script는 React mount 전에 localStorage와 OS preference를 해석해
FOUC를 막는 장치였다. 단일 다크에서는 해석할 상태 자체가 없다. 대신 브라우저
native control도 dark로 그리도록 `color-scheme` 메타를 선언하고, 역할별 기본
weight 세 개만 preload한다. Google Fonts 연결도 제거되어 네트워크 의존성과
개인정보 노출 면적이 줄었다.

### 5. UI store state cleanup

```diff
diff --git a/ui/src/store/storeUIImpl.ts b/ui/src/store/storeUIImpl.ts
index 9ab558f..2ed93c7 100644
--- a/ui/src/store/storeUIImpl.ts
+++ b/ui/src/store/storeUIImpl.ts
@@ -18,15 +18,12 @@ import {
   HISTORY_STRIP_LAYOUT_STORAGE_KEY,
   RIGHT_PANEL_OPEN_STORAGE_KEY,
-  THEME_FAMILY_STORAGE_KEY,
-  THEME_STORAGE_KEY,
   UI_MODE_STORAGE_KEY,
 } from "./persistenceRegistry";
@@ -38,7 +35,7 @@
-import type { ThemePreference, ThemeFamily, HistoryStripLayout, UIMode } from "../types";
+import type { HistoryStripLayout, UIMode } from "../types";
@@ -162,16 +159,6 @@ export function setUIModeImpl(m: UIMode, set: StoreSet): void {
-export function setThemeImpl(theme: ThemePreference, set: StoreSet): void {
-  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
-  set({ theme, resolvedTheme: resolveThemePreference(theme) });
-}
-
-export function setThemeFamilyImpl(family: ThemeFamily, set: StoreSet): void {
-  try { localStorage.setItem(THEME_FAMILY_STORAGE_KEY, family); } catch {}
-  set({ themeFamily: family });
-}
```

setter만 제거해서는 충분하지 않다. registry 키, persistence resolver, store 타입,
초기 상태, public action wiring을 같은 커밋에서 함께 지웠다. 따라서 오래된
`ima2:theme` 값이 localStorage에 남아 있어도 새 런타임은 이를 읽거나 DOM에
반영하지 않는다.

## 디자인 토큰 체계

### Surface colors

| 토큰 | 값 | 역할 | 사용 원칙 |
|---|---|---|---|
| `--bg` | `#0b0b0f` | 최하위 앱 배경 | 화면 전체와 favicon 기준색 |
| `--surface` | `#14141a` | 1차 패널 | nav, workspace shell |
| `--surface-2` | `#1c1c23` | 상승된 내부 면 | 선택적 카드/컨트롤 |
| `--surface-3` | `#26262f` | 가장 높은 중립 면 | hover/active/강한 구획 |
| `--border` | `#26262f` | 기본 경계 | surface-3와 톤을 맞춘 저대조 선 |
| `--border-strong` | `#3d3d49` | 강조 경계 | focus 이외의 강한 구조 경계 |
| `--control-bg` | `rgba(255,255,255,.03)` | 입력 배경 | 별도 카드처럼 보이지 않는 상승 |
| `--control-hover` | `rgba(255,255,255,.08)` | hover | 위치/상태 피드백 |

면의 순서는 밝기만 높이는 회색 사다리가 아니라 blue-violet 성분을 공유한다.
따라서 각 패널이 다른 제품 조각처럼 보이지 않으면서, border를 과도하게 쓰지
않고도 레이어를 구분할 수 있다.

### Text hierarchy

| 토큰 | Phase 010 값 | 의미 |
|---|---|---|
| `--text` | `#f4f4f6` | 제목, 핵심 값, 주 행동 |
| `--text-dim` | `#b6b6c2` | 본문, 보조 설명 |
| `--text-muted` | `#7e7e8c` | metadata와 약한 label |
| `--text-faint` | `#55555f` | 장식, 비활성, placeholder 후보 |
| `--on-scrim` | `#f6f7fb` | 이미지/영상 scrim 위 텍스트 |

Phase 010은 의미 계층을 토큰으로 고정한 단계다. 이후 Phase 026에서 실제 AA
감사를 거쳐 `--text-muted`가 `#90909d`로 상향되므로, 이 표의 값은 해당 커밋
시점의 역사적 기록이다. faint는 의미 텍스트에 쓰지 않는다는 후속 규칙도
이 토큰 위계에서 파생되었다.

### Special effects: grain, glow, prism, chrome, glass

| 효과 | 정의/구현 | 목적 | 제한 |
|---|---|---|---|
| grain | `body::after`, fractalNoise SVG, opacity `.026` | 평면 dark surface의 밴딩 완화와 촉감 | pointer events 없음, media surface는 불투명 면으로 차단 |
| glow | `body::before`, cyan/magenta radial gradients | shell 모서리의 공간감 | 5.5%/3.5% 저불투명도, 콘텐츠 대비를 침범하지 않음 |
| prism | 5-stop `linear-gradient(100deg, ...)` | 선택적 브랜드/accent 순간 | 본문 배경으로 남용 금지 |
| chrome | white→steel→dark steel→white 수직 gradient | 금속성 display treatment | 작은 텍스트 fill 금지 |
| glass | white 4% alpha | overlay surface | blur만으로 경계를 대체하지 않음 |
| glass-line | white 10% alpha | glass edge | card 남발 방지, overlay에 한정 |

grain과 glow는 `position: fixed`, `z-index: 0`, `pointer-events: none`이며
`#root`가 `position: relative; z-index: 1`로 올라간다. 이 구조는 인터랙션 hit
testing을 건드리지 않고, 스크롤마다 pseudo-element가 재배치되지 않게 한다.
노드 캔버스와 viewer는 자체 불투명 surface로 이 레이어를 자연스럽게 덮는다.

### Font stack

| 역할 | primary | fallback | weights |
|---|---|---|---|
| 본문/UI | Satoshi | Pretendard Variable, system-ui, sans-serif | 400, 500, 700 |
| display | Clash Display | Pretendard Variable, system-ui, sans-serif | 600, 700 |
| metadata | IBM Plex Mono | SF Mono, Menlo, monospace | 400, 500 |

세 stack은 글자 모양의 차이뿐 아니라 정보 종류를 구분한다. display는 브랜드와
큰 hierarchy break에만, mono는 provider 이름·비용·상태·짧은 label에만 쓴다.
일반 문장을 mono로 표시하거나 작은 label을 display로 표시하면 정보 밀도와
가독성이 무너지므로 consumer CSS에서 역할을 뒤섞지 않는다.

## 삭제된 코드 분석

### ThemeToggle component

117줄 컴포넌트에는 family popover와 system/dark/light segmented control이
함께 있었다. family menu는 열림 상태, 바깥 클릭 listener, Escape listener,
listbox ARIA 상태를 소유했다. 단일 테마 결정 후 이를 CSS로 숨기면 store 구독과
listener 코드가 계속 번들에 남는다. 파일 삭제는 UI와 runtime 비용을 동시에
제거한다.

### Theme persistence

삭제된 persistence 흐름은 다음과 같았다.

1. `ui/index.html` inline script가 `ima2:theme`을 먼저 읽는다.
2. 값이 없으면 `prefers-color-scheme`을 해석한다.
3. `data-theme`와 `style.colorScheme`을 HTML root에 쓴다.
4. Zustand가 같은 preference를 다시 복원한다.
5. setter가 mode/family 변경을 localStorage에 기록한다.
6. App effect가 resolved state를 DOM dataset과 동기화한다.

Phase 010은 이 여섯 지점을 함께 제거했다. bootstrap만 남으면 오래된 저장값이
CSS selector를 활성화하고, store만 남으면 존재하지 않는 선택지를 public API로
노출한다. 따라서 삭제는 HTML, CSS, React, Zustand, types, tests를 관통한다.

### Theme families

삭제 대상은 light mode 하나가 아니라 `default`, `gpt`, `claude`, `gemini`,
`grok` family 전체다. 각 family는 palette, accent, font, canvas/minimap 색을
mode별로 재정의했다. 이 모델은 provider 선택과 제품 visual identity를 결합해,
provider를 바꿀 때 인터페이스 자체가 다른 제품처럼 변하는 문제가 있었다.
새 구조에서 provider는 생성 capability이고, studio identity는 항상 동일하다.

### External font dependency

Google Fonts의 Outfit/Geist stylesheet, 두 preconnect, 원격 font request가
삭제되었다. self-host 자산은 앱 버전과 함께 배포되므로 외부 서비스 가용성이나
CSS 응답 변경에 좌우되지 않는다. preload는 각 family의 최초 사용 weight만
선택해 모든 7개 파일을 초기 네트워크 우선순위에 올리는 과잉도 피한다.

## 마이그레이션 영향

### React consumers

- `App.tsx`는 `theme`, `resolvedTheme`, `themeFamily` selector와 DOM 동기화
  effect를 제거해야 했다.
- `SettingsWorkspace.tsx`는 ThemeToggle import와 설정 행을 제거해야 했다.
- 삭제된 컴포넌트를 참조하는 barrel/export가 없어야 했다.
- viewer workflow의 `[data-theme]` 조건부 CSS는 단일 selector로 접어야 했다.

### Store and types

- `ThemePreference`, `ThemeFamily`, `THEME_FAMILIES` public 타입을 제거했다.
- Store state의 `theme`, `resolvedTheme`, `themeFamily` 필드를 제거했다.
- `setTheme`, `setThemeFamily` action과 구현을 제거했다.
- persistence registry에서 storage key와 migration 항목을 제거했다.
- 초기 state hydration이 theme resolver를 호출하지 않도록 정리했다.

### Tests and documentation

- node UI contract test는 다중 테마 selector 존재를 기대하지 않아야 한다.
- 반대로 `color-scheme: dark`, self-host font, 단일 canvas token 계약은 새
  회귀 기준이 된다.
- file/function map은 삭제 파일과 제거된 setter를 계속 가리키지 않아야 한다.
- i18n의 theme mode/family 문구는 dead translation으로 남기지 않는다.

### Runtime and persisted user data

기존 사용자의 localStorage에 theme key가 남아도 새 코드가 읽지 않으므로 동작상
문제는 없다. 명시적 삭제 migration을 추가하지 않은 이유는 값 자체가 민감하거나
큰 데이터가 아니고, 읽기 경로 제거만으로 결정성이 확보되기 때문이다. 사용자
설정이 light였더라도 업그레이드 후에는 항상 dark가 적용되는 것이 의도된
breaking visual migration이다.

### 후속 구현자를 위한 계약

1. 새 색은 component에 하드코딩하지 않고 기존 semantic token을 먼저 사용한다.
2. provider별 root theme selector를 다시 만들지 않는다.
3. media inspection surface에는 grain/glow가 비치지 않게 불투명 배경을 유지한다.
4. prism/chrome은 브랜드 강조이며 정보 텍스트의 대비를 대신하지 않는다.
5. font 역할은 body/display/mono 세 범주를 유지한다.
6. 새로운 theme preference를 도입하려면 CSS만이 아니라 HTML bootstrap, store,
   persistence, tests까지 다시 설계해야 하므로 별도 architecture phase로 다룬다.
