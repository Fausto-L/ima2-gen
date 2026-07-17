# 020 — 사이드바 프로바이더·모델 드롭다운 커스텀 재설계 (코멘트 1)

목표: `GenProviderModelSelect`의 네이티브 `<select>` 2개를 앱 디자인 언어(다크, 모노스페이스 pill)에 맞는 커스텀 드롭다운으로 교체. |프로바이더|모델| 분리 유지, GPT 계열 reasoning effort는 모델 메뉴 하위 그룹으로.

**퇴행 진단:** 리포에는 이미 완성형 커스텀 드롭다운이 2개 존재한다 — `ui/src/components/controls/Select.tsx`(범용 glass listbox, 키보드 완비, 168행)와 `ui/src/components/ImageModelSelect.tsx`(portal+포지셔닝 포함, `button#sidebar-image-model`). WP8(커밋 6b07145)의 GenProviderModelSelect가 네이티브 select로 만들어지며 사이드바 디자인이 퇴행했다. 020은 **신규 발명이 아니라 기존 `controls/Select` 재사용/확장**이다.

선행: 010 (모델 카탈로그 optgroup 데이터 구조). 이 phase의 P에서 `cxc-dev-frontend` + `cxc-dev-uiux-design` 스킬을 로드해 디자인 방향(DESIGN dial)을 기록한 뒤 구현한다.

## 변경 파일 목록

| 파일 | 종류 | 내용 |
|------|------|------|
| `ui/src/components/controls/Select.tsx` | MODIFY | 옵션 그룹(`groups?: SelectGroup[]`) 하위호환 확장 + trigger sub 텍스트 |
| `ui/src/components/GenProviderModelSelect.tsx` | MODIFY | select 2개 → `Select` 2개 (pill 클래스 유지) |
| 기존 Select 스타일 파일 | MODIFY | 그룹 헤더 스타일만 추가 (Select가 쓰는 css 파일을 B에서 확인) |
| `tests/` UI 계약 테스트 | MODIFY | 렌더/그룹 계약 (기존 mcp-provider-ui-contract 패턴) |

## 1. `ui/src/components/controls/Select.tsx` (MODIFY — 하위호환 확장)

```ts
export type SelectGroup<V extends string> = { label?: ReactNode; items: ReadonlyArray<SelectItem<V>> };
// Props에 추가 (items와 상호배타, groups 우선):
//   groups?: ReadonlyArray<SelectGroup<V>>;
//   triggerLabel?: ReactNode;   // 닫힌 pill의 짧은 라벨 (기본: 선택 항목 label)
//   triggerClassName?: string;  // pill 클래스 주입 (image-model-select__trigger--pill)
//   title?: string;
```

- 내부는 groups를 flat items로 펼쳐 기존 activeIndex/키보드 로직 재사용, 렌더에서만 그룹 헤더 행 삽입(`role="presentation"`).
- 기존 소비자(flat items) 무변경 통과 — 시그니처는 옵션 추가만.
- 그룹 헤더 스타일: Select가 현재 쓰는 css 파일(네임스페이스 `.ctl-select__*` — B에서 실제 파일 확인)에 `.ctl-select__group-label` 추가(10px 대문자 letter-spacing, muted).
- **portal 모드(감사 blocker 5 + R2-2):** `portal?: boolean` prop 추가. 현행 Select는 absolute 포지션이라 overflow 클리핑되는 사이드바에서 잘린다 — `ImageModelSelect.tsx`의 `createPortal` + `menuPos`(fixed, trigger rect 측정, `useLayoutEffect` 재계산) 패턴을 이식해 `portal` 활성 시 `document.body`로 렌더. 사이드바 인스턴스 2개는 `portal` 사용, 기존 소비자는 기본값 false로 무변경.
  - **outside-click 가드(R2-2):** 현행 `Select.tsx:51-58`은 `rootRef` 밖 pointerdown을 전부 닫힘 처리 — 포탈된 메뉴는 rootRef 밖이라 항목 클릭 전에 unmount된다. `menuRef`를 추가해 `rootRef.contains(target) || menuRef.current?.contains(target)`이면 닫지 않는 containment 가드 필수(`ImageModelSelect.tsx:102-121` 패턴). resize/scroll 시 menuPos 재계산 또는 닫기, 닫힐 때 trigger 포커스 복귀·리스너 해제 cleanup 포함.

## 2. `GenProviderModelSelect.tsx` (MODIFY)

- 프로바이더 `Select` groups: `[ {label: coreProviders, items: CORE_PROVIDER_OPTIONS}, {label: connectedProviders, items: MCP(잠금은 disabled+sub)} ]`. value 인코딩(`core:`/`mcp:`)과 onChange 로직은 기존 그대로.
- 모델 `Select` groups (MCP 레인): 010의 `img:`/`vid:` 인코딩 그대로 — `[ {label: t("mcp.imageModels"), items}, {label: t("mcp.videoModels"), items} ]`.
- 모델 `Select` groups (코어 레인): 기존 image/video 옵션 그룹 + `isGptFamily`면 `{label: t("sidebar.reasoningLabel"), items: effort(`effort:` 인코딩)}` 그룹. trigger pill 라벨에 현재 effort 병기(코멘트의 "추론강도는 모델 밑에" 반영).
- **보존 계약(blocker 4):** unavailable-provider disabled 항목(`mcp:` 접두사 + `mcp.unavailable` sub)과 unknown-model detached 항목을 그룹 구조에서도 동일하게 렌더.
- 인라인 width style은 CSS로 이동, `compact` prop은 클래스 스위치로.

## 3. 테스트

- Select 그룹 확장 단위: 그룹 렌더·disabled 클릭 무시·flat 하위호환 (기존 테스트 하네스 방식 — jsdom 없으면 소스/모듈 계약 검사 — `mcp-provider-ui-contract.test.js` 접근 방식 재사용).

## 완료 기준

- 네이티브 `<select>`가 GenProviderModelSelect에서 사라짐(rg로 0건).
- 스크린샷 증적: 닫힘 pill 2개 + 열린 모델 메뉴(image/video 그룹, seedance-2 보임).
- typecheck/ui build/테스트 통과.
