---
created: 2026-07-12
tags: [ima2-gen, phase, shell, navigation]
---

# Phase 030 — 좌측 레일 + 라우팅

스펙: `002_shell-navigation.md`. 010/020으로 새 질감·컨트롤이 깔린 뒤
구조를 바꾼다. 여기까지가 "디자인/구조" 구간이고 신규 서버 기능은 없다.

## 범위

1. 아이콘 레일: 생성(classic) / 캔버스 / 노드 / 에이전트 / 설정.
   `UIModeSwitch` 흡수. 홈·자산 슬롯은 자리만 예약(060/050에서 활성화).
2. 해시 라우팅(`#create` `#canvas` `#node` `#agent`) + 새로고침 복원 +
   `persistenceRegistry.ts` 마지막 모드 저장.
3. 모바일: 레일 → 하단 탭바(`MobileAppBar` 확장).
4. 승격 동선 1차: 클래식 결과 → "캔버스에서 편집" 상시 액션만 먼저
   (나머지 체이닝은 040).

## 명시적 제외

- 홈 워크스페이스 내용물(→ 060), Assets 워크스페이스(→ 050).

## Done 기준

- 모든 기존 진입점 레일 경유 도달 + 해시 복원 계약 테스트.
- 390px 탭바 스크린샷 → `assets/030/`.

상태: **done** (2026-07-12 — NavRail 5슬롯+해시 라우팅+UIModeSwitch 삭제+sol 11항목 감사, assets/030/ 실화면 검수)

## Diff-Level Record

커밋: `2b552d5` (`2b552d5c09688c2f129fb2c74eb6bc26010cb229`)

비교 범위: `690073e..2b552d5` — **26 files, +505 / -240**. 이 범위에는
Phase 030뿐 아니라 선행 Settings polish 3커밋(`48a110c`, `3e71bd5`,
`fb5af2d`)이 포함된다. 따라서 NavRail의 핵심 신규 표면은 아래 2개 파일
(합계 **+269 / -0**)이며, 26파일 전체 수치를 NavRail 단독 수치로 해석하지 않는다.

| 구분 | 파일 | Diff |
|---|---|---:|
| Docs | `structure/01-file-function-map.md` | +1 / -1 |
| Docs | `structure/02-command-reference.md` | +11 / -4 |
| Contract | `tests/agent-mode-frontend-contract.test.js` | +3 / -3 |
| Contract | `tests/card-news-frontend-contract.test.js` | +6 / -3 |
| Contract | `tests/cli-skill-command-contract.test.js` | +16 / -0 |
| Contract | `tests/gallery-navigation-ux-contract.test.js` | +5 / -5 |
| Wiring | `ui/src/App.tsx` | +2 / -0 |
| Settings polish | `ui/src/components/AccountSettings.tsx` | +36 / -4 |
| Core | `ui/src/components/NavRail.tsx` | +182 / -0 |
| Settings polish | `ui/src/components/SettingsWorkspace.tsx` | +3 / -10 |
| Shell cleanup | `ui/src/components/Sidebar.tsx` | +0 / -2 |
| Replacement | `ui/src/components/UIModeSwitch.tsx` | +0 / -58 |
| Settings polish | `ui/src/components/settings/QuotaCard.tsx` | +70 / -75 |
| Labels/polish | `ui/src/i18n/en.json` | +10 / -7 |
| Labels/polish | `ui/src/i18n/ko.json` | +10 / -7 |
| Wiring | `ui/src/index.css` | +1 / -0 |
| Shell cleanup | `ui/src/styles/agent-panels-composer.css` | +0 / -4 |
| Shell cleanup | `ui/src/styles/agent-workspace.css` | +6 / -2 |
| Mixed shell/polish | `ui/src/styles/canvas-viewer.css` | +18 / -9 |
| Shell cleanup | `ui/src/styles/classic-workspace.css` | +4 / -4 |
| Core | `ui/src/styles/nav-rail.css` | +87 / -0 |
| Shell cleanup | `ui/src/styles/node-workspace.css` | +0 / -24 |
| Settings polish | `ui/src/styles/quota-card.css` | +2 / -4 |
| Wiring | `ui/src/styles/responsive-layout.css` | +1 / -0 |
| Settings polish | `ui/src/styles/settings-controls.css` | +19 / -2 |
| Theme/polish | `ui/src/styles/themes.css` | +12 / -12 |

Before -> After:

- 화면별 `UIModeSwitch`와 분산된 설정 진입점 -> 선언형 `RAIL_ITEMS` 기반 전역 NavRail.
- Zustand 내부 모드만으로 전환 -> `#create`, `#canvas`, `#node`, `#agent`, `#settings`와 상태를 양방향 동기화하고 새로고침 시 복원.
- Settings를 workspace mode처럼 취급 -> `settingsAction` overlay 목적지로 분리.
- 데스크톱 전용 workspace 전환 -> 같은 목적지를 모바일 safe-area 하단 bar로 투영.

### Sub-phase 031 — duplicate settings entry removal

커밋: `6be0d4b` (`6be0d4b9df42af267a8c574cb7d2e8e32530e790`);
비교 범위 `2b552d5..6be0d4b` — **1 file, +0 / -2**.

| 파일 | Diff | Before -> After |
|---|---:|---|
| `ui/src/components/Sidebar.tsx` | +0 / -2 | Sidebar의 `SettingsButton` import/render -> NavRail의 단일 전역 설정 진입점 |

## 전체 파일 변경표

아래 표는 Phase 030 본 커밋 `2b552d5` 자체의 `git show --stat` 기준이다.
선행 Settings polish를 포함한 넓은 비교 범위와 구분하기 위해 커밋 단위 수치인
**21 files, +356 / -122**를 기록한다.

| # | 경로 | 상태 | 추가 | 삭제 | 변경 목적 |
|---:|---|---|---:|---:|---|
| 1 | `structure/01-file-function-map.md` | M | 1 | 1 | shell 파일 지도 갱신 |
| 2 | `structure/02-command-reference.md` | M | 11 | 4 | navigation/skill command 문서 정합화 |
| 3 | `tests/agent-mode-frontend-contract.test.js` | M | 3 | 3 | rail이 추가된 agent grid 계약 |
| 4 | `tests/card-news-frontend-contract.test.js` | M | 6 | 3 | shell 진입 구조 계약 변경 |
| 5 | `tests/cli-skill-command-contract.test.js` | M | 16 | 0 | CLI skill 계약 보강 |
| 6 | `tests/gallery-navigation-ux-contract.test.js` | M | 5 | 5 | UIModeSwitch에서 NavRail 계약으로 전환 |
| 7 | `ui/src/App.tsx` | M | 2 | 0 | 전역 shell에 NavRail mount |
| 8 | `ui/src/components/NavRail.tsx` | A | 182 | 0 | rail, routing, mobile projection 신설 |
| 9 | `ui/src/components/Sidebar.tsx` | M | 0 | 2 | 기존 mode switch 결선 제거 |
| 10 | `ui/src/components/UIModeSwitch.tsx` | D | 0 | 58 | 분산 mode switch 삭제 |
| 11 | `ui/src/i18n/en.json` | M | 7 | 0 | navigation label 추가 |
| 12 | `ui/src/i18n/ko.json` | M | 7 | 0 | navigation label 추가 |
| 13 | `ui/src/index.css` | M | 1 | 0 | nav-rail.css import |
| 14 | `ui/src/styles/agent-panels-composer.css` | M | 0 | 4 | rail 추가에 따른 중복 grid 규칙 제거 |
| 15 | `ui/src/styles/agent-workspace.css` | M | 6 | 2 | rail column을 보존하는 agent grid |
| 16 | `ui/src/styles/canvas-viewer.css` | M | 5 | 0 | shell column 보정 |
| 17 | `ui/src/styles/classic-workspace.css` | M | 4 | 4 | classic workspace column 이동 |
| 18 | `ui/src/styles/nav-rail.css` | A | 87 | 0 | desktop rail/mobile bar 스타일 |
| 19 | `ui/src/styles/node-workspace.css` | M | 0 | 24 | 이전 grid override 제거 |
| 20 | `ui/src/styles/responsive-layout.css` | M | 1 | 0 | mobile bottom bar clearance |
| 21 | `ui/src/styles/themes.css` | M | 12 | 12 | rail 토큰과 theme 정합화 |
| 합계 | 21 files |  | 356 | 122 | `2b552d5` |

### 넓은 비교 범위와의 관계

| 범위 | 파일 | 추가 | 삭제 | 해석 |
|---|---:|---:|---:|---|
| `690073e..2b552d5` | 26 | 505 | 240 | Settings polish 3커밋 포함 |
| commit `2b552d5` | 21 | 356 | 122 | Phase 030 본 변경 |
| `2b552d5..6be0d4b` | 1 | 0 | 2 | Sub-phase 031 |

## NavRail 아키텍처

### 설계 경계

NavRail은 새 workspace를 만들지 않는다. 기존 Zustand `uiMode`를 전역 shell의
단일 navigation model로 투영하고, settings overlay를 별도 action으로 다룬다.
라우팅은 서버 router가 아니라 URL hash와 client state 간의 얇은 동기화다.

```text
RAIL_ITEMS
  -> enabled feature gate
  -> desktop top/bottom groups
  -> mobile flat bottom bar
  -> navigate(item)
       -> uiMode or settingsOpen
       -> history.replaceState(hash)

location.hash
  -> resolveHash()
  -> sync()
  -> uiMode or settingsOpen
```

### RailItem 모델

```tsx
type RailItem = {
  id: string;
  mode?: UIMode;
  settingsAction?: boolean;
  icon: () => ReactNode;
  labelKey: string;
  enabled: boolean;
  bottom?: boolean;
};
```

| 필드 | 의미 | 불변조건 |
|---|---|---|
| `id` | React key 및 목적지 식별자 | item마다 고유 |
| `mode` | Zustand workspace mode | 일반 workspace item에 존재 |
| `settingsAction` | settings overlay action 여부 | mode와 구별 |
| `icon` | 18px inline SVG component | 장식 SVG는 `aria-hidden` |
| `labelKey` | i18n key | aria-label/title 공통 사용 |
| `enabled` | feature gate 결과 | render 전에 filter |
| `bottom` | desktop 하단 그룹 여부 | settings에 사용 |

### RAIL_ITEMS 선언

```tsx
const RAIL_ITEMS: RailItem[] = [
  {
    id: "create",
    mode: "classic",
    icon: IconCreate,
    labelKey: "nav.create",
    enabled: true,
  },
  {
    id: "node",
    mode: "node",
    icon: IconNode,
    labelKey: "nav.node",
    enabled: ENABLE_NODE_MODE,
  },
  {
    id: "agent",
    mode: "agent",
    icon: IconAgent,
    labelKey: "nav.agent",
    enabled: ENABLE_AGENT_MODE,
  },
  {
    id: "settings",
    settingsAction: true,
    icon: IconSettings,
    labelKey: "nav.settings",
    enabled: true,
    bottom: true,
  },
];
```

### item 파이프라인

```tsx
const enabledItems = RAIL_ITEMS.filter((it) => it.enabled);
const topItems = enabledItems.filter((it) => !it.bottom);
const bottomItems = enabledItems.filter((it) => it.bottom);
```

| 단계 | desktop | mobile |
|---|---|---|
| feature filtering | `enabledItems` | `enabledItems` |
| grouping | `topItems` / `bottomItems` | 그룹 없이 flat |
| order | create → node → agent / settings | create → node → agent → settings |
| settings placement | rail 하단 | bottom bar의 마지막 tab |

### feature gate

`ENABLE_NODE_MODE`와 `ENABLE_AGENT_MODE`는 item 선언의 `enabled`에 주입된다.
따라서 disabled 기능은 CSS로 숨기는 것이 아니라 DOM 생성 전에 제외된다.
Create와 Settings는 항상 활성이다.

| item | gate | off일 때 |
|---|---|---|
| Create | `true` | 해당 없음 |
| Node | `ENABLE_NODE_MODE` | item 미렌더링 |
| Agent | `ENABLE_AGENT_MODE` | item 미렌더링 |
| Settings | `true` | 해당 없음 |

### mode와 settings의 분리

Settings는 `UIMode`가 아니다. `settingsOpen` overlay 상태이므로 item은
`mode: "settings"` 대신 `settingsAction: true`를 가진다. 이 구분 덕분에
settings를 닫을 때 이전 `uiMode`로 정확히 돌아갈 수 있다.

```tsx
const isActive = (item: RailItem) => {
  if (item.settingsAction) return settingsOpen;
  return !settingsOpen && item.mode === uiMode;
};
```

| 상태 | Create active | Node active | Agent active | Settings active |
|---|---:|---:|---:|---:|
| classic + closed | yes | no | no | no |
| node + closed | no | yes | no | no |
| agent + closed | no | no | yes | no |
| any mode + settings open | no | no | no | yes |

### renderItem

```tsx
const renderItem = (item: RailItem) => (
  <button
    key={item.id}
    type="button"
    className={`nav-rail__btn${isActive(item) ? " is-active" : ""}`}
    onClick={() => navigate(item)}
    aria-label={t(item.labelKey)}
    aria-current={isActive(item) ? "page" : undefined}
    title={t(item.labelKey)}
  >
    <item.icon />
  </button>
);
```

접근성 이름과 tooltip은 같은 i18n key를 사용한다. 현재 목적지는
`aria-current="page"`로 표현하고, icon SVG는 `aria-hidden="true"`다.

## Hash Routing 구현

### hash ↔ mode 표

| hash | 내부 mode | settings | 비고 |
|---|---|---:|---|
| `#create` | `classic` | false | classic 기본 진입점 |
| `#canvas` | `classic` | false | canvas는 현재 classic의 sub-state |
| `#node` | `node` | false | node workspace |
| `#agent` | `agent` | false | agent workspace |
| `#settings` | `classic` 반환값 | true | 실제 mode 대신 overlay open |
| unknown/empty | no resolution | no change | 기존 persisted state 유지 |

### mapping 상수

```tsx
const HASH_TO_MODE: Record<string, UIMode | "settings"> = {
  "#create": "classic",
  "#canvas": "classic",
  "#node": "node",
  "#agent": "agent",
};

const MODE_TO_HASH: Record<string, string> = {
  classic: "#create",
  node: "#node",
  agent: "#agent",
};
```

`#canvas`는 읽기 방향 mapping에만 있다. 현재 canvas가 독립 `UIMode`가 아니므로
mode에서 hash를 생성할 때는 classic의 canonical hash인 `#create`를 쓴다.

### hash resolver

```tsx
function resolveHash(): { mode: UIMode; settings: boolean } | null {
  const h = location.hash;
  if (h === "#settings") return { mode: "classic", settings: true };
  const m = HASH_TO_MODE[h];
  if (m && m !== "settings") return { mode: m, settings: false };
  return null;
}
```

resolver는 side effect가 없다. location을 읽고 정규화된 `{ mode, settings }`
또는 `null`을 반환한다. 알 수 없는 hash를 classic으로 강제하지 않는 이유는
기존 persistence 복원 결과를 불필요하게 덮어쓰지 않기 위해서다.

### UI → hash/Zustand

```tsx
const navigate = useCallback((item: RailItem) => {
  if (item.settingsAction) {
    if (settingsOpen) {
      closeSettings();
      history.replaceState(null, "", MODE_TO_HASH[uiMode] || "#create");
    } else {
      openSettings();
      history.replaceState(null, "", "#settings");
    }
    return;
  }
  if (item.mode) {
    if (settingsOpen) closeSettings();
    setUIMode(item.mode);
    history.replaceState(null, "", MODE_TO_HASH[item.mode] || "#create");
  }
}, [uiMode, settingsOpen, setUIMode, openSettings, closeSettings]);
```

#### settings click 상태 전이

| before | action | store after | hash after |
|---|---|---|---|
| settings closed, classic | Settings click | open, classic 유지 | `#settings` |
| settings closed, node | Settings click | open, node 유지 | `#settings` |
| settings open, node retained | Settings click | closed, node | `#node` |
| settings open, agent retained | Settings click | closed, agent | `#agent` |

#### mode click 상태 전이

| before | target | store after | hash after |
|---|---|---|---|
| settings closed, classic | Node | node | `#node` |
| settings open, classic retained | Agent | settings closed + agent | `#agent` |
| agent | Create | classic | `#create` |

### replaceState 선택

rail click은 `history.pushState`가 아니라 `history.replaceState`를 사용한다.
현재 구현은 workspace 전환마다 browser history entry를 쌓지 않는다. 따라서
잦은 mode 토글이 뒤로가기 stack을 오염시키지 않는다.

| API | 이 구현의 선택 | 효과 |
|---|---:|---|
| `pushState` | no | rail click마다 entry를 쌓지 않음 |
| `replaceState` | yes | 현재 URL의 hash만 canonicalize |
| `location.hash =` | no | 직접 hashchange를 유발하는 결선 회피 |

### hash → Zustand

```tsx
useEffect(() => {
  const sync = () => {
    const resolved = resolveHash();
    if (!resolved) return;
    if (resolved.settings) {
      openSettings();
    } else {
      if (settingsOpen) closeSettings();
      setUIMode(resolved.mode);
    }
  };
  sync();
  window.addEventListener("popstate", sync);
  window.addEventListener("hashchange", sync);
  return () => {
    window.removeEventListener("popstate", sync);
    window.removeEventListener("hashchange", sync);
  };
}, []);
```

### sync trigger

| trigger | 목적 |
|---|---|
| component mount | 새로고침/직접 URL 진입 복원 |
| `popstate` | browser history 이동 반영 |
| `hashchange` | 외부 hash 변경 반영 |
| cleanup | unmount 시 listener 제거 |

effect는 mount 시점의 store action을 사용하도록 의도적으로 1회 설치된다.
lint 예외 주석은 listener 재설치보다 안정된 단일 subscription을 택한 기록이다.

### persistence와 hash 우선순위

| 입력 | 결과 |
|---|---|
| 인식 가능한 hash 존재 | hash가 해당 mode/settings를 복원 |
| hash가 비었거나 미지원 | resolver가 null, 기존 Zustand state 유지 |
| Settings hash | settings overlay open, underlying mode는 보존 가능 |
| mode item click | setter가 persistence 경로를 그대로 사용 |

NavRail은 persistenceRegistry를 직접 쓰지 않는다. `setUIMode`라는 기존 store
action을 사용하므로 마지막 mode 저장 책임은 store 계층에 남는다.

## 모바일 대응

### desktop rail

```tsx
return (
  <nav className="nav-rail" aria-label={t("nav.ariaLabel")}>
    <div className="nav-rail__top">{topItems.map(renderItem)}</div>
    <div className="nav-rail__bottom">{bottomItems.map(renderItem)}</div>
  </nav>
);
```

```css
.nav-rail {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 52px;
  height: 100dvh;
  padding: 8px 0;
  background: var(--bg);
  border-right: 1px solid var(--hairline-soft);
  z-index: 100;
  overflow: hidden;
}

.nav-rail__top,
.nav-rail__bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
```

desktop에서는 52px 고정 column이며 top/bottom 그룹을 `space-between`으로
분리한다. Create/Node/Agent는 위, Settings는 아래에 놓인다.

### mobile bottom bar

```tsx
if (isMobile) {
  return (
    <nav className="nav-rail nav-rail--mobile" aria-label={t("nav.ariaLabel")}>
      {enabledItems.map(renderItem)}
    </nav>
  );
}
```

```css
.nav-rail--mobile {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  flex-direction: row;
  justify-content: space-around;
  width: auto;
  height: auto;
  padding:
    6px
    max(8px, env(safe-area-inset-right))
    max(6px, env(safe-area-inset-bottom))
    max(8px, env(safe-area-inset-left));
  border-right: none;
  border-top: 1px solid var(--hairline-soft);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  z-index: 200;
}
```

### desktop/mobile 비교

| 축 | desktop | mobile |
|---|---|---|
| 위치 | 좌측 grid column | viewport 하단 fixed |
| 방향 | column | row |
| 크기 | 52px × 100dvh | full width × content height |
| item | 40×40 | 44×44 |
| 그룹 | top/bottom | flat evenly spaced |
| 경계 | right border | top border |
| 배경 | opaque `--bg` | 88% glass + blur |
| safe area | 불필요 | left/right/bottom env 반영 |
| z-index | 100 | 200 |

### 반응형 이중 안전장치

React의 `useIsMobile()`이 올바른 variant 하나를 렌더링한다. CSS media query는
class가 잘못 공존하거나 hydration/resize 경계가 생길 때 반대 variant를 숨기는
추가 안전장치다.

```css
@media (max-width: 800px) {
  .nav-rail:not(.nav-rail--mobile) {
    display: none;
  }
}

@media (min-width: 801px) {
  .nav-rail--mobile {
    display: none;
  }
}
```

### button 상태 CSS

```css
.nav-rail__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.nav-rail__btn:hover {
  color: var(--text);
  background: var(--control-hover);
}

.nav-rail__btn.is-active {
  color: var(--accent-bright);
  background: var(--accent-soft);
}

.nav-rail--mobile .nav-rail__btn {
  width: 44px;
  height: 44px;
}
```

## UIModeSwitch 교체 경계

| Before | After |
|---|---|
| Sidebar 내부 mode switch | App shell의 NavRail |
| 화면별 전환 표현 | 선언형 RAIL_ITEMS |
| mode만 표현 | mode + settings overlay |
| URL 계약 없음 | hash URL 계약 |
| desktop 중심 | mobile bottom projection |
| component 58줄 | 삭제 후 NavRail로 책임 이동 |

NavRail mount는 App 수준에서 이뤄지며, 각 workspace의 grid column은 rail의
52px column을 전제로 한 칸씩 이동했다. agent/prompt-studio/settings처럼 별도
grid를 가진 표면은 rail column 보존 여부가 감사 핵심이었다.

## Sub-phase 031

### 문제

Phase 030이 전역 Settings item을 제공한 뒤에도 Sidebar header의 기존
`SettingsButton`이 남아 동일 목적지의 버튼이 두 개 보였다. 기능 충돌보다
정보 구조의 단일 진입점 원칙을 위반하는 시각적 중복이었다.

### 실제 diff

```tsx
 import { PromptComposer } from "./PromptComposer";
 import { GenerateButton } from "./GenerateButton";
 import { InFlightList } from "./InFlightList";
 import { SessionPicker } from "./SessionPicker";
-import { SettingsButton } from "./SettingsButton";
 import { ImageModelSelect } from "./ImageModelSelect";
```

```tsx
 <div className="logo-actions">
   <PromptLibraryButton />
   <ImageModelSelect
     variant="sidebar"
     agentSettings={agentSettings}
     onAgentSettingsChange={onAgentSettingsChange}
   />
-  <SettingsButton />
 </div>
```

### 변경 요약

| 항목 | 값 |
|---|---|
| commit | `6be0d4b9df42af267a8c574cb7d2e8e32530e790` |
| range | `2b552d5..6be0d4b` |
| files | 1 |
| insertions | 0 |
| deletions | 2 |
| touched file | `ui/src/components/Sidebar.tsx` |
| removed import | `SettingsButton` |
| removed render | `<SettingsButton />` |
| canonical entry | NavRail Settings item |

### Before → After 사용자 동선

| Before | After |
|---|---|
| Sidebar header gear 존재 | 제거 |
| NavRail Settings item 존재 | 유지 |
| 동일 overlay 진입점 2개 | 전역 진입점 1개 |
| 좁은 header action 밀도 증가 | Prompt Library + Model selector만 유지 |
| mobile/desktop 진입점 불일치 가능 | NavRail projection으로 통일 |

### 삭제가 안전한 이유

1. Settings 기능 자체는 삭제하지 않았다.
2. `openSettings` action은 NavRail이 계속 호출한다.
3. `#settings` hash 계약도 NavRail이 유지한다.
4. Sidebar의 prompt/model action은 그대로 남는다.
5. 삭제 범위는 import 1줄과 render 1줄뿐이다.
6. 새 abstraction이나 fallback은 추가하지 않았다.

## 상태 전이 매트릭스

| 시작 hash | 시작 store | 사용자 행동 | 종료 hash | 종료 store |
|---|---|---|---|---|
| `#create` | classic/closed | Node | `#node` | node/closed |
| `#create` | classic/closed | Agent | `#agent` | agent/closed |
| `#node` | node/closed | Create | `#create` | classic/closed |
| `#agent` | agent/closed | Settings | `#settings` | agent/open |
| `#settings` | agent/open | Settings | `#agent` | agent/closed |
| `#settings` | classic/open | Node | `#node` | node/closed |
| direct `#node` | persisted classic | mount sync | `#node` | node/closed |
| direct `#settings` | persisted agent | mount sync | `#settings` | agent/open |
| unknown hash | persisted node | mount sync | unchanged | node 유지 |

## 검증 체크리스트

| 영역 | 검증 | 기대 결과 |
|---|---|---|
| mount | `#create` 직접 진입 | classic 활성 |
| mount | `#node` 직접 진입 | node 활성 |
| mount | `#agent` 직접 진입 | agent 활성 |
| mount | `#settings` 직접 진입 | settings overlay 활성 |
| navigation | mode item click | store와 hash 동시 갱신 |
| navigation | settings open 중 mode click | overlay close 후 mode 전환 |
| navigation | settings 재클릭 | underlying mode hash 복원 |
| history | popstate | hash를 store로 반영 |
| history | hashchange | hash를 store로 반영 |
| history | rail 반복 클릭 | 불필요한 history entry 미누적 |
| feature gate | node off | Node item 미렌더링 |
| feature gate | agent off | Agent item 미렌더링 |
| accessibility | active item | `aria-current="page"` |
| accessibility | navigation landmark | 번역된 `aria-label` |
| desktop | 801px 이상 | 좌측 rail만 표시 |
| mobile | 800px 이하 | 하단 bar만 표시 |
| mobile | safe-area device | bottom/left/right inset 확보 |
| mobile | touch target | 44×44 button |
| layout | agent workspace | rail column 유지 |
| layout | settings workspace | grid-column 2/-1 span |
| regression 031 | Sidebar header | SettingsButton 없음 |
| regression 031 | NavRail | Settings item 1개 존재 |
| build | `cd ui && npm run build` | production build 성공 |
