---
created: 2026-07-12
tags: [ima2-gen, phase, settings, uiux, design-read]
---

# Phase 025 — 설정 워크스페이스 재설계

현 `SettingsWorkspace`는 6섹션(account / generation / appearance /
workspace / language / future) 균등 나열 스크롤 문서다. 슬롭 진단:

- **"future" 플레이스홀더 섹션** — 빈 약속은 필러. 삭제 대상.
- **위계 없음** — API 키 입력(1회성)과 기본 품질(가끔)과 언어(거의 안 바꿈)가
  전부 같은 무게의 섹션. 설정이 아니라 목차다.
- **워크스페이스 컨트롤과 중복** — generation 기본값은 RightPanel과 겹친다.
  같은 결정을 두 곳에서 하게 만드는 구조.
- 010 이후 theme 항목 소멸(다크 단일) → appearance 섹션 근거 약화.

## Design Read (cxc-dev-uiux-design)

```yaml
---
name: ima2-settings
colors:
  primary: "#f4f4f6"
  accent: "#cfd2dd"      # 프리즘은 생성 순간 전용 — 설정에서는 무채
  background: "#0b0b0f"
typography:
  heading: { fontFamily: Clash Display, fontSize: 20px }
  body: { fontFamily: "Satoshi / Pretendard Variable", fontSize: 14px }
  meta: { fontFamily: IBM Plex Mono, fontSize: 11px }
---
```

Reading this as: 로컬 스튜디오 도구의 환경설정면, 사용자는 파워유저 본인.
DaVinci Resolve 환경설정이나 시네마 카메라 메뉴의 밀도 — 장비 패널이지
제품 소개 페이지가 아니다.

Do's: 상태는 mono 상태 칩으로(연결됨 / 키 없음 / 쿼터 82%), 섹션 라벨은
mono uppercase eyebrow, 글래스 패널 카드.
Don'ts: 빈 섹션, 마케팅형 설명문, 프리즘 그라데이션 장식, 이모지.

```
DESIGN_VARIANCE: 3
MOTION_INTENSITY: 1
Product density profile: D5
Reasoning: 반복 작업 도구의 설정면 — 밀도는 높이고 시각 변주는 억제,
모션은 피드백만.
```

## IA 재배치 (Lazy-User Gate 적용)

| 항목 | 처분 | 근거 |
|---|---|---|
| future 섹션 | **삭제** | 필러. 로드맵은 devlog 소관. |
| theme(appearance) | **삭제** | 010 다크 단일화로 소멸. |
| generation 기본값 | **흡수(수정)** | RightPanel 컨트롤이 진실원. 항목들은 Providers 그룹의 컴팩트 행으로 흡수. *steering 2026-07-12: "기본값으로 저장" 액션은 신규 스토어 로직이라 025의 "표현만 변경" 계약과 충돌 → 보류하고 중복 축소로 대체. 필요해지면 별도 phase.* |
| language | **강등** | 시스템 로캘 자동 감지 default + 하단 한 줄 셀렉트로. |
| account + providers | **통합 승격** | 설정의 실제 존재 이유. 프로바이더별 카드(키/OAuth 상태 칩 + QuotaCard + Switch Account)로 첫 화면. |
| workspace | 유지 | 프로필/저장 경로 등 1회성 설정 성격에 맞음. |

결과: 6섹션 → 3그룹(Providers / Workspace / General). 화면당 primary
action 하나 원칙 유지.

## 범위

1. IA 재배치 표대로 섹션 통폐합(`SettingsWorkspace.tsx` + settings/*).
2. 프로바이더 카드 UI: 상태 칩(mono), QuotaCard 통합, 키 입력은 카드 내
   인라인(020 컨트롤 킷 소비 1호 화면 — 킷 쇼케이스로 삼는다).
3. 섹션 인덱스는 유지하되 3그룹으로 축소, eyebrow 라벨 적용.
4. i18n 키 정리(`settings.sections.*` 재편, ko/en 동기).

## 의존/제외

- 010(토큰)·020(컨트롤 킷) 선행 필수. 030(레일)과는 독립.
- 신규 설정 항목 추가 없음. 서버 API 무변경.
- 감사(sol/Darwin) 반영 v3: 진입점 3곳(useAppStore 기본값,
  ProviderReadinessPopup, OnboardingPopup)을 `providers`로 이동,
  LanguageToggle은 이미 세그먼트 문법이라 유지(steering), Gemini/Vertex는
  API-key 아코디언 IA 유지(카드화는 시각 구조만), 클래스 계약 동결
  `.provider-card` / `.provider-card__head` / `.provider-chip--ok|warn|err`.

## Done 기준

- settings persistence 계약 테스트 green(키 재편 마이그레이션 포함).
- 3그룹 구조 스크린샷 → `assets/025/`.
- 키보드 전 조작 + 스크린리더 섹션 랜드마크 확인.

상태: **done** (2026-07-12 — 게이트 green, assets/025/ 실화면 검수, 6섹션→3그룹+프로바이더 카드 완료)

후속(2026-07-12, 사용자 제안): USAGE QUOTA 별도 행을 폐지하고 쿼터를
프로바이더 카드 안으로 통합 — Codex 쿼터+계정 전환은 GPT OAuth 카드,
Grok 쿼터+전환은 Grok 카드 내부로(useQuotaData 훅 공유 fetch 1회).
증거: assets/026/quota-merged.png

## Diff-Level Record

- 커밋: `7c01ab7`
- 비교 범위: `6d2e236..7c01ab7`
- 통계: **16 files, +188 / −221** (`git diff --stat 6d2e236..7c01ab7`)

| 파일 | + | − | diff-level 역할 |
|---|---:|---:|---|
| `tests/prompt-studio-ui-contract.test.js` | 3 | 2 | 프롬프트 스튜디오의 변경된 settings 계약 고정 |
| `tests/settings-workspace-layout-contract.test.js` | 4 | 4 | 6섹션 기대를 3그룹 IA 계약으로 교체 |
| `ui/src/components/AccountSettings.tsx` | 38 | 30 | provider 별 glass card, 상태 chip, 인라인 control 구성 |
| `ui/src/components/GeminiKeySection.tsx` | 8 | 7 | Gemini/Vertex key 행을 provider-card IA에 맞게 정렬 |
| `ui/src/components/ImageModelSelect.tsx` | 18 | 17 | native `<select>` 잔여분을 control-kit `Select`로 전환 |
| `ui/src/components/OnboardingPopup.tsx` | 1 | 1 | settings 진입 section을 `providers`로 변경 |
| `ui/src/components/ProviderReadinessPopup.tsx` | 1 | 1 | provider readiness 진입점을 `providers`로 변경 |
| `ui/src/components/SettingsWorkspace.tsx` | 24 | 43 | 6섹션 스크롤 문서를 Providers/Workspace/General 3그룹으로 축소 |
| `ui/src/components/settings/WorkspaceProfileSettings.tsx` | 6 | 11 | workspace 설정을 컴팩트 행 구조로 정리 |
| `ui/src/i18n/en.json` | 8 | 39 | 삭제된 section 키 제거 및 3그룹 label 동기화 |
| `ui/src/i18n/ko.json` | 8 | 39 | 영문과 동일한 IA로 한국어 키 축소 |
| `ui/src/store/useAppStore.ts` | 3 | 3 | 기본 settings section을 `account`에서 `providers`로 이동 |
| `ui/src/styles/canvas-accordion.css` | 0 | 22 | 이전 settings/accordion 표현 제거 |
| `ui/src/styles/responsive-mobile.css` | 1 | 1 | 변경된 settings 구조의 mobile selector 보정 |
| `ui/src/styles/settings-controls.css` | 64 | 0 | glass provider card, head, chip, row 시각 계약 추가 |
| `ui/src/types.ts` | 1 | 1 | `SettingsSection` union을 6개에서 3개로 축소 |

### Before → After Patterns

- `account | generation | appearance | workspace | language | future` →
  `providers | workspace | general`.
- 평면적인 OAuth/API/Grok/Antigravity settings row → provider 별 glass
  card + mono 상태 chip + 카드 내 인라인 control.
- 화면별 native `<select>` → 020 control-kit `Select`.
- `account`를 가리키던 onboarding/readiness/default 진입점 →
  통합된 `providers` 진입점.
- 중복된 generation/appearance/future 섹션 → 실제 설정 목적만
  남긴 고밀도 workspace.

### Settings Polish Chain (027-029)

025의 IA 재설계와 026의 contrast/deboxing 뒤에 이어진 settings
전용 후속 폴리시 연쇄다.

#### 027 — Quota → Provider Card Merge

- 커밋: `48a110c` | 범위: `690073e..48a110c`
- 통계: **6 files, +77 / −70**

| 파일 | + | − | 변경 |
|---|---:|---:|---|
| `ui/src/components/AccountSettings.tsx` | 4 | 0 | provider card에 quota slot 연결 |
| `ui/src/components/SettingsWorkspace.tsx` | 0 | 2 | 독립 quota section render 제거 |
| `ui/src/components/settings/QuotaCard.tsx` | 71 | 60 | 독립 카드를 provider 내부 inline quota로 재구성 |
| `ui/src/i18n/en.json` | 0 | 2 | 독립 quota section label 제거 |
| `ui/src/i18n/ko.json` | 0 | 2 | 독립 quota section label 제거 |
| `ui/src/styles/quota-card.css` | 2 | 4 | provider-card 내 inline 배치로 축소 |

독립 `USAGE QUOTA` 행 → 해당 OAuth/Grok provider card 내 quota +
account switch 문맥.

#### 028 — Provider Card Line Condensation

- 커밋: `3e71bd5` | 범위: `48a110c..3e71bd5`
- 통계: **3 files, +21 / −37**

| 파일 | + | − | 변경 |
|---|---:|---:|---|
| `ui/src/components/settings/QuotaCard.tsx` | 15 | 31 | multi-line quota 블록을 single-line condensed row로 축소 |
| `ui/src/i18n/en.json` | 3 | 3 | 한 줄 배치에 맞는 축약 label |
| `ui/src/i18n/ko.json` | 3 | 3 | 영문과 동일한 축약 label |

multi-line quota label/value → 라벨과 값을 한 줄에 둔 condensed row.

#### 029 — Minimal Chrome + One-Line Provider Heads

- 커밋: `fb5af2d` | 범위: `3e71bd5..fb5af2d`
- 통계: **6 files, +67 / −27**

| 파일 | + | − | 변경 |
|---|---:|---:|---|
| `ui/src/components/AccountSettings.tsx` | 32 | 4 | SVG icon + provider name + status chip 한 줄 head |
| `ui/src/components/SettingsWorkspace.tsx` | 3 | 8 | settings 외곽 chrome과 중복 설명 축소 |
| `ui/src/i18n/en.json` | 0 | 2 | 불필요한 chrome copy 제거 |
| `ui/src/i18n/ko.json` | 0 | 2 | 불필요한 chrome copy 제거 |
| `ui/src/styles/canvas-viewer.css` | 13 | 9 | 연관 viewer padding/배치 정리 |
| `ui/src/styles/settings-controls.css` | 19 | 2 | one-line provider head 스타일 |

설명과 chrome가 두꺼운 provider card head → icon/name/status가 한 줄인
minimal head; settings shell 장식과 중복 copy → 최소 chrome.

## 전체 파일 변경표

### 025 본체 — `6d2e236..7c01ab7`

아래 표는 `git diff --numstat 6d2e236..7c01ab7`의 16개 파일을
빠짐없이 옮긴 것이다. 숫자는 최종 스냅샷 사이의 line delta이며, 중간
커밋에서 이동하거나 다시 다듬어진 줄은 별도 polish chain에서 추적한다.

| # | 파일 | 추가 | 삭제 | 계약 / 관찰 지점 |
|---:|---|---:|---:|---|
| 1 | `tests/prompt-studio-ui-contract.test.js` | 3 | 2 | settings 진입점과 프롬프트 스튜디오 연결 계약 갱신 |
| 2 | `tests/settings-workspace-layout-contract.test.js` | 4 | 4 | section union과 3그룹 렌더 순서 고정 |
| 3 | `ui/src/components/AccountSettings.tsx` | 38 | 30 | provider card와 status chip 도입 |
| 4 | `ui/src/components/GeminiKeySection.tsx` | 8 | 7 | Gemini/Vertex 키 UI를 카드 내부 문법으로 맞춤 |
| 5 | `ui/src/components/ImageModelSelect.tsx` | 18 | 17 | image model native select를 kit `Select`로 교체 |
| 6 | `ui/src/components/OnboardingPopup.tsx` | 1 | 1 | `account` deep-link를 `providers`로 변경 |
| 7 | `ui/src/components/ProviderReadinessPopup.tsx` | 1 | 1 | readiness 복구 동선을 `providers`로 변경 |
| 8 | `ui/src/components/SettingsWorkspace.tsx` | 24 | 43 | 6 section을 3 group으로 축약하고 gallery Select 전환 |
| 9 | `ui/src/components/settings/WorkspaceProfileSettings.tsx` | 6 | 11 | workspace profile control 밀도 축소 |
| 10 | `ui/src/i18n/en.json` | 8 | 39 | 6개 section copy를 3개로 정리하고 theme/future 삭제 |
| 11 | `ui/src/i18n/ko.json` | 8 | 39 | 영어 IA와 동일한 한국어 key tree 유지 |
| 12 | `ui/src/store/useAppStore.ts` | 3 | 3 | 초기 section과 유효 section을 `providers` 기준으로 변경 |
| 13 | `ui/src/styles/canvas-accordion.css` | 0 | 22 | 폐기된 settings accordion 표현 제거 |
| 14 | `ui/src/styles/responsive-mobile.css` | 1 | 1 | 새 settings selector에 mobile rule 연결 |
| 15 | `ui/src/styles/settings-controls.css` | 64 | 0 | glass card, head, chip, compact row 스타일 추가 |
| 16 | `ui/src/types.ts` | 1 | 1 | `SettingsSection`을 3개 literal union으로 축소 |
| **합계** | **16 files** | **188** | **221** | **서버/API 변경 없음** |

### 027–029 후속 파일 집합

후속 커밋은 025의 IA를 되돌리지 않고 같은 surface의 정보 밀도를 계속
줄였다. 아래는 각 범위에 실제로 등장하는 파일이다.

| phase | commit / range | 파일 | + | - | 역할 |
|---|---|---|---:|---:|---|
| 027 | `48a110c` / `690073e..48a110c` | `ui/src/components/AccountSettings.tsx` | 4 | 0 | quota data를 provider card에 주입 |
| 027 | 동일 | `ui/src/components/SettingsWorkspace.tsx` | 0 | 2 | 독립 `QuotaCard` 제거 |
| 027 | 동일 | `ui/src/components/settings/QuotaCard.tsx` | 71 | 60 | fetch hook과 provider별 quota block 분리 |
| 027 | 동일 | `ui/src/i18n/en.json` | 0 | 2 | 독립 quota heading 제거 |
| 027 | 동일 | `ui/src/i18n/ko.json` | 0 | 2 | 한국어 독립 heading 제거 |
| 027 | 동일 | `ui/src/styles/quota-card.css` | 2 | 4 | inline quota chrome 축소 |
| 028 | `3e71bd5` / `48a110c..3e71bd5` | `ui/src/components/settings/QuotaCard.tsx` | 15 | 31 | quota header와 icon 중복 제거 |
| 028 | 동일 | `ui/src/i18n/en.json` | 3 | 3 | condensed label로 교체 |
| 028 | 동일 | `ui/src/i18n/ko.json` | 3 | 3 | condensed 한국어 label로 교체 |
| 029 | `fb5af2d` / `3e71bd5..fb5af2d` | `ui/src/components/AccountSettings.tsx` | 32 | 4 | brand icon과 one-line head 구성 |
| 029 | 동일 | `ui/src/components/SettingsWorkspace.tsx` | 3 | 8 | shell chrome/copy 축소 |
| 029 | 동일 | `ui/src/i18n/en.json` | 0 | 2 | 중복 설명 제거 |
| 029 | 동일 | `ui/src/i18n/ko.json` | 0 | 2 | 중복 설명 제거 |
| 029 | 동일 | `ui/src/styles/canvas-viewer.css` | 13 | 9 | 주변 viewer spacing 정돈 |
| 029 | 동일 | `ui/src/styles/settings-controls.css` | 19 | 2 | one-line head layout 확정 |

## 정보구조 재편 상세

### section union: 6 → 3

이전 union은 화면 목차의 이름을 그대로 상태 타입으로 사용했다.

```ts
// before
type SettingsSection =
  | "account"
  | "generation"
  | "appearance"
  | "workspace"
  | "language"
  | "future";
```

재편 후 union은 사용자가 설정을 찾는 상위 목적만 남긴다.

```ts
// after
type SettingsSection = "providers" | "workspace" | "general";
```

`SettingsWorkspace`의 배열과 ref map도 동일한 집합을 사용한다. 따라서 nav,
scroll spy, programmatic scroll의 가능한 값이 타입 수준에서 함께 줄어든다.

```tsx
const SETTINGS_SECTIONS: SettingsSection[] = [
  "providers",
  "workspace",
  "general",
];

const sectionRefs = useRef<Record<SettingsSection, HTMLElement | null>>({
  providers: null,
  workspace: null,
  general: null,
});
```

### 실제 section mapping

| 이전 section | 이전 내용 | 새 section | 처리 |
|---|---|---|---|
| `account` | OAuth, API key, Grok, Antigravity | `providers` | 이름을 목적 중심으로 승격 |
| `generation` | image model, quality/default controls | `providers` | provider/model 문맥으로 흡수 |
| `appearance` | history strip layout | `workspace` | 작업면 배치 설정으로 이동 |
| `workspace` | workspace profile | `workspace` | 유지하되 첫 행으로 승격 |
| `language` | locale toggle | `general` | 저빈도 일반 설정으로 강등 |
| `future` | 예약 설명문 | 없음 | 구현 없는 placeholder 삭제 |

Providers의 실제 렌더 순서는 계정 상태, quota, model/provider default를 한
연속 문맥으로 읽게 한다. Workspace는 프로필, history layout, gallery scope를
모은다. General은 locale만 남아도 별도 고수준 분류로 안정적이다.

```tsx
<SettingsSectionBlock id="providers" setRef={setSectionRef}>
  <AccountSettings />
  <QuotaCard />
  {/* image model and provider controls */}
</SettingsSectionBlock>

<SettingsSectionBlock id="workspace" setRef={setSectionRef}>
  <WorkspaceProfileSettings />
  <HistoryStripLayoutToggle />
  {/* gallery default scope */}
</SettingsSectionBlock>

<SettingsSectionBlock id="general" setRef={setSectionRef}>
  <LanguageToggle />
</SettingsSectionBlock>
```

### i18n key diff

영문 key diff는 단순 번역 수정이 아니라 IA migration 그 자체다.

```diff
 "sections": {
-  "account": { "title": "Account", "hint": "GPT OAuth status" },
-  "generation": { "title": "Generation", "hint": "Model defaults" },
-  "appearance": { "title": "Appearance", "hint": "History layout" },
-  "workspace": { "title": "Workspace", "hint": "Profile" },
-  "language": { "title": "Language", "hint": "Interface copy" },
-  "future": { "title": "Future", "hint": "Reserved" }
+  "providers": {
+    "title": "Providers",
+    "hint": "Accounts, keys, models"
+  },
+  "workspace": {
+    "title": "Workspace",
+    "hint": "Profile, layout, gallery"
+  },
+  "general": {
+    "title": "General",
+    "hint": "Language"
+  }
 }
```

subtitle도 새 탐색 축을 직접 설명한다.

```diff
-"Account, display, and future workspace controls live here so the generator stays focused."
+"Providers, workspace behavior, and interface preferences live here so the generator stays focused."
```

구현되지 않은 미래 약속과 다크 단일화 이후 무효가 된 theme tree는 함께
삭제됐다.

```diff
-"future": {
-  "title": "Reserved for later",
-  "body": "Future provider repair and workspace controls will appear here when they become useful."
-}
-"theme": {
-  "label": "Theme",
-  "modeLabel": "Brightness",
-  "styleLabel": "Theme style",
-  "system": "System",
-  "dark": "Dark",
-  "light": "Light"
-}
```

`en.json`과 `ko.json`은 같은 shape를 유지한다. 한 언어에만 옛 section이
남으면 `t("settings.sections.${section}.title")` 동적 lookup이 언어별로
깨지므로, 이 변경은 copy cleanup이면서 런타임 key contract 변경이다.

### deep-link migration

설정 화면을 여는 세 곳도 새 section id로 동시에 이동했다.

```diff
-openSettings("account")
+openSettings("providers")
```

적용 지점은 다음과 같다.

1. `useAppStore.ts`: 기본/초기 settings section.
2. `ProviderReadinessPopup.tsx`: 준비되지 않은 provider 복구 동선.
3. `OnboardingPopup.tsx`: onboarding에서 계정 설정으로 이동하는 동선.

이 세 곳 중 하나라도 `account`를 유지하면 union 축소 뒤 compile error 또는
잘못된 scroll target이 발생한다. 즉 6→3 전환은 표시 목록만 바꾸는 작업이
아니라 진입점, 상태, 번역, scroll ref를 하나의 migration으로 묶은 작업이다.

## Provider Card 구현

### row에서 glass card로

기존 account row는 제목/설명과 우측 상태를 동일한 범용 row 문법으로
표시했다.

```tsx
// before
<article className="settings-row">
  <div className="settings-row__copy">
    <p className="settings-eyebrow">{t("settings.account.primaryEyebrow")}</p>
    <h4>{t("settings.account.oauthTitle")}</h4>
    <p>{t("settings.account.oauthBody")}</p>
  </div>
  <div className={`settings-status${oauthReady ? " is-ok" : ""}`}>
    <span aria-hidden="true" />
    {statusLabel(t, oauth?.status)}
  </div>
</article>
```

새 구조는 provider identity와 상태를 카드 head에 고정한다.

```tsx
// after
<article className="provider-card">
  <div className="provider-card__head">
    <h4>{t("settings.account.oauthTitle")}</h4>
    <span className={`provider-chip provider-chip--${statusTone(oauth?.status)}`}>
      {statusLabel(t, oauth?.status)}
    </span>
  </div>
  <div className="settings-row__copy">
    <p className="settings-eyebrow">{t("settings.account.primaryEyebrow")}</p>
    <p>{t("settings.account.oauthBody")}</p>
  </div>
</article>
```

glass 처리는 장식용 gradient가 아니라 어두운 workspace 위에서 provider
경계를 만드는 얇은 surface다. `settings-controls.css`에 64줄이 추가되어
card, head, chip, row의 공통 배치 계약을 담당한다. 의미 계층은 다음 순서다.

1. 카드 외곽: provider 단위 경계.
2. head: 이름과 현재 상태를 한 glance에 제공.
3. copy: 인증 방식과 복구 설명.
4. inline control/quota: 해당 provider에만 영향을 주는 조작.

### status label과 tone 분리

표시 문구와 색상 tone은 별도 함수다. 번역 문자열을 CSS 상태 판정에
재사용하지 않으므로 locale 변경이 시각 의미를 바꾸지 않는다.

```ts
function statusLabel(t: (key: string) => string, status?: string): string {
  if (status === "ready") return t("settings.account.status.ready");
  if (status === "auth_required") return t("settings.account.status.authRequired");
  if (status === "error") return t("settings.account.status.error");
  if (status === "offline") return t("settings.account.status.offline");
  return t("settings.account.status.checking");
}

function statusTone(status?: string): "ok" | "warn" | "err" {
  if (status === "ready") return "ok";
  if (status === "error" || status === "offline") return "err";
  return "warn";
}
```

| provider status | chip modifier | 의미 | 사용자 해석 |
|---|---|---|---|
| `ready` | `provider-chip--ok` | 정상 사용 가능 | 추가 조치 불필요 |
| `error` | `provider-chip--err` | 인증/검증 실패 | 키 또는 로그인 점검 필요 |
| `offline` | `provider-chip--err` | provider 연결 불가 | 프로세스/네트워크 복구 필요 |
| `auth_required` | `provider-chip--warn` | 인증 대기 | 로그인 액션 필요 |
| `undefined` / checking | `provider-chip--warn` | 확인 중/미확정 | 성급한 성공 표시 금지 |

API key 카드는 status endpoint 문자열 대신 로컬 판정을 같은 tone vocabulary로
정규화한다.

```tsx
<span
  className={`provider-chip provider-chip--${
    error ? "err" : apiReady ? "ok" : "warn"
  }`}
>
  {error
    ? t("settings.account.apiUnknown")
    : apiReady
      ? t("settings.account.apiReady")
      : t("settings.account.apiUnavailable")}
</span>
```

따라서 OAuth, API key, Grok처럼 상태 출처가 달라도 화면에서는
`ok|warn|err` 세 tone만 소비한다. `offline`을 중립 회색이 아니라 error로
분류한 이유는 사용자가 현재 생성할 수 없다는 결과가 `error`와 같기 때문이다.

## Settings Polish Chain (027-029)

### 027 — quota merge (`690073e..48a110c`)

025 시점에는 provider card 아래에 독립 `QuotaCard`가 남아 있었다.

```tsx
<SettingsSectionBlock id="providers" setRef={setSectionRef}>
  <AccountSettings />
  <QuotaCard />
  {/* remaining provider controls */}
</SettingsSectionBlock>
```

027은 fetch lifecycle을 hook으로 올리고 provider별 view를 분리했다.

```ts
/** Shared quota fetch — call once in the parent and pass results down. */
export function useQuotaData() {
  const [data, setData] = useState<QuotaResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // refreshQuota와 timer lifecycle은 한 번만 유지한다.
  return { data, loading, refreshQuota };
}

type QuotaBlockProps = {
  data: QuotaResponse | null;
  loading: boolean;
  onRefresh: () => void;
};
```

Codex와 Grok view는 각각 자기 provider card에 삽입 가능한 block이 됐다.

```tsx
export function CodexQuota({ data, loading, onRefresh }: QuotaBlockProps) {
  const codex = data?.codex;
  const hasCodexWindows = codex?.windows && codex.windows.length > 0;

  return (
    <div className="quota-card">
      {loading
        ? <span className="quota-card__loading">Loading</span>
        : hasCodexWindows
          ? codex!.windows.map((w) => <QuotaBar key={w.label} window={w} />)
          : <span className="quota-card__hint">No quota data</span>}
      <SwitchAccountButton provider="codex" onComplete={onRefresh} />
    </div>
  );
}
```

`AccountSettings`는 hook을 단 한 번 호출하고 두 카드에 같은 snapshot과 refresh
함수를 전달한다.

```tsx
const quota = useQuotaData();

<article className="provider-card">
  {/* OpenAI head and copy */}
  <CodexQuota
    data={quota.data}
    loading={quota.loading}
    onRefresh={quota.refreshQuota}
  />
</article>

<article className="provider-card">
  {/* Grok head and copy */}
  <GrokQuota
    data={quota.data}
    loading={quota.loading}
    onRefresh={quota.refreshQuota}
  />
</article>
```

이 구조의 핵심은 quota fetch를 카드 수만큼 중복하지 않는 것이다. account
switch 완료 시 동일 `refreshQuota`가 호출되어 두 provider block이 같은 응답
세대에서 다시 그려진다.

### 028 — line condensation (`48a110c..3e71bd5`)

027의 provider card 안에는 quota 자체의 provider icon/name header가 남아
카드 head와 의미가 중복됐다.

```diff
-<div className="quota-card__header">
-  <CodexIcon />
-  <strong>Codex</strong>
-  {accountLine && <span className="quota-card__account">{accountLine}</span>}
-</div>
+{accountLine ? (
+  <div className="quota-card__header">
+    <span className="quota-card__account">{accountLine}</span>
+  </div>
+) : null}
```

Grok도 icon/name 반복을 지우고 계정과 billing만 한 줄에 남겼다.

```diff
-<GrokIcon />
-<strong>Grok</strong>
 {grokAccountLine && (
   <span className="quota-card__account">{grokAccountLine}</span>
 )}
 {grok?.billing && (
   <span className="quota-card__billing">
     ${grok.billing.usedUsd.toFixed(1)}/${grok.billing.limitUsd}
   </span>
 )}
```

삭제된 `CodexIcon`/`GrokIcon`은 기능 손실이 아니다. provider identity는 이미
상위 head가 소유하므로 quota block에서 반복하면 수직 높이와 시각 경쟁만
늘어난다. 15 additions / 31 deletions라는 delta도 이 phase가 새로운 표현을
쌓기보다 중복을 덜어낸 작업임을 보여준다.

### 029 — one-line provider heads (`3e71bd5..fb5af2d`)

029는 brand SVG를 quota 내부가 아니라 identity를 소유한 provider head로
올렸다. icon, provider name, source eyebrow, status chip이 같은 line에 놓인다.

```tsx
<div className="provider-card__head">
  <span className="provider-card__brand"><OpenAIIcon /></span>
  <h4>{t("settings.account.oauthTitle")}</h4>
  <span className="provider-card__eyebrow">
    {t("settings.account.primaryEyebrow")}
  </span>
  <span className={`provider-chip provider-chip--${statusTone(oauth?.status)}`}>
    {statusLabel(t, oauth?.status)}
  </span>
</div>
```

API key도 같은 OpenAI brand를 쓰되 eyebrow가 source를 설명한다.

```tsx
<div className="provider-card__head">
  <span className="provider-card__brand"><OpenAIIcon /></span>
  <h4>{t("settings.account.apiTitle")}</h4>
  <span className="provider-card__eyebrow">{apiSource}</span>
  <span className={`provider-chip provider-chip--${error ? "err" : apiReady ? "ok" : "warn"}`}>
    {apiReady ? t("settings.account.apiReady") : t("settings.account.apiUnavailable")}
  </span>
</div>
```

Grok/Gemini도 같은 슬롯 순서를 사용한다. 결과적으로 시선은 카드마다 같은
좌표에서 brand → provider → source → state를 읽는다. 아래 설명 paragraph는
head에서 eyebrow가 빠졌으므로 한 줄 덜 차지한다.

Polish chain 전체를 밀도 관점에서 요약하면 다음과 같다.

```text
025  generic settings rows
  ↓ provider boundary
provider cards + independent quota row
  ↓ 027 contextual merge
provider cards containing quota blocks
  ↓ 028 duplicate identity removal
single-line quota/account details
  ↓ 029 ownership-correct identity
brand + name + source + status in one provider head
```

## Kit Select 전환 상세

### gallery default scope

`SettingsWorkspace`의 gallery scope는 native select에서 control-kit `Select`로
전환됐다.

```tsx
// before
<select
  value={galleryDefaultScope}
  onChange={(e) =>
    setGalleryDefaultScope(e.target.value as GalleryScope)
  }
  aria-label={t("settings.gallery.defaultScopeTitle")}
>
  <option value="current-session">{t("gallery.scope.current")}</option>
  <option value="all">{t("gallery.scope.all")}</option>
</select>
```

```tsx
// after
<Select
  ariaLabel={t("settings.gallery.defaultScopeTitle")}
  value={galleryDefaultScope}
  onChange={(v) => setGalleryDefaultScope(v as GalleryScope)}
  items={[
    { value: "current-session", label: t("gallery.scope.current") },
    { value: "all", label: t("gallery.scope.all") },
  ]}
/>
```

변환 규칙은 기계적이지만 prop shape 차이를 명시해야 한다.

| native select | kit Select | 변환 |
|---|---|---|
| `aria-label` | `ariaLabel` | kit public prop 사용 |
| `event.target.value` | callback의 `value` | DOM event 의존 제거 |
| `<option>` children | `items[]` | 값/label 데이터를 배열로 전달 |
| browser chrome | kit chrome | settings visual grammar 통일 |

### image model select

`ImageModelSelect.tsx`도 같은 범위에서 18 additions / 17 deletions로 바뀌었다.
모델 목록은 기존 계산 결과를 유지하고 렌더 adapter만 kit shape로 바꾼다.

```tsx
// native shape
<select value={model} onChange={(event) => setModel(event.target.value)}>
  {models.map((entry) => (
    <option key={entry.value} value={entry.value}>
      {entry.label}
    </option>
  ))}
</select>
```

```tsx
// kit shape
<Select
  value={model}
  onChange={setModel}
  items={models.map((entry) => ({
    value: entry.value,
    label: entry.label,
  }))}
/>
```

이 전환에서 모델/provider 선택 로직은 바뀌지 않는다. 저장되는 값, option
순서, disabled/availability 판정은 기존 source가 소유하고 `Select`는 표시와
상호작용만 담당한다.

### migration 검증 포인트

1. `current-session`과 `all` 값이 persistence 값과 철자까지 동일해야 한다.
2. translation label이 바뀌어도 저장 값은 바뀌지 않아야 한다.
3. `onChange`가 DOM event가 아니라 string value를 주므로 기존 handler를 그대로
   넘기지 않는다.
4. `ariaLabel`이 누락되면 visible label과 control association을 다시 확인한다.
5. native `<option>`에 있던 disabled 조건이 있다면 kit item metadata로 옮긴다.

025의 Select 전환은 새 설정 기능을 추가한 것이 아니라 020 control kit의
소비 지점을 늘린 것이다. 따라서 성공 조건은 동작 변화가 아니라 동일한 값
계약, 일관된 keyboard interaction, settings surface의 chrome 통일이다.
