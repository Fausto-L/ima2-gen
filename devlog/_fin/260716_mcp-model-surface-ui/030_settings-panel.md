# 030 — 우측 Settings 패널 리팩토링: status 최상단 + 프로바이더별 섹션 (코멘트 2)

목표: `GenerationControlsPanel`(`div.right-panel-settings`)을 (a) 연결 status 스트립을 최상단에 고정하고, (b) 아래 컨트롤이 선택된 프로바이더에 따라 통째로 바뀌는 구조로 리팩토링. MCP 프로바이더(Runway) 선택 시 전용 컨트롤 섹션 제공.

선행: 010 (`mcpMediaKind`, `getMcpModelCatalog`). 020과 파일 겹침 없음(사이드바 vs 우측 패널).

## 변경 파일 목록

| 파일 | 종류 | 내용 |
|------|------|------|
| `ui/src/components/settings/ProviderStatusStrip.tsx` | NEW | 코어+MCP 연결 상태 요약 스트립 |
| `ui/src/components/settings/McpGenerationControls.tsx` | NEW | MCP 레인 전용 컨트롤(kind 토글·모델·ratio) |
| `ui/src/components/GenerationControlsPanel.tsx` | MODIFY | 상단 status 스트립 + 프로바이더별 섹션 스위치 |
| `ui/src/components/ProviderSelect.tsx` | MODIFY | (필요 시) availability 훅 재사용 export 유지 — 시각 요소는 스트립으로 이동하되 선택 탭은 유지 |
| `ui/src/store/storeTypes.ts` | MODIFY | `mcpRatio: string \| null` 필드 + `setMcpRatio` 액션 타입 |
| `ui/src/store/useAppStore.ts` | MODIFY | `mcpRatio: null` 초기화 + `setMcpRatio` 바인딩 |
| `ui/src/store/storeSettingsImpl.ts` | MODIFY | `setMcpRatioImpl`, `clearMcpLane` 리셋, `runMcpGenerate` ratio 대체 |
| `ui/src/store/storePersistence.ts` | MODIFY | generation defaults에 `mcpRatio` 영속(옵션) |
| `ui/src/lib/mcpSelection.ts` | MODIFY | `buildMcpGenerationInput`에 `mcpRatio` 반영 (Auto=키 생략) |
| `tests/mcp-media-kind-behavior.test.ts` | MODIFY | ratio restore/clear/Auto-생략 케이스 확장 (010 신설분 확장) |
| `ui/src/styles/right-panel.css` | MODIFY | 스트립·MCP 섹션 스타일 |
| `tests/settings-workspace-layout-contract.test.js` 또는 신규 | MODIFY/NEW | 패널 구조 계약 |

## 1. `ProviderStatusStrip.tsx` (NEW)

- 데이터: `useProviderAvailability()` (코어 6종 ok/reason) + MCP providers는 **props로 수신**(부모 GenerationControlsPanel이 `useMcpProviders()` 1회 호출 — §5 폴러 중복 방지와 일관).
- 렌더: 한 줄 스트립(줄바꿈 허용), 항목 = 색 점(green/amber/red) + 짧은 라벨(GPT, API, Grok, xAI, Gem, Runway, Higgs). title에 reason/detail. MCP 항목 클릭 시 SettingsWorkspace의 MCP 연결 카드로 이동(기존 라우팅 헬퍼 확인 후 anchor 또는 콜백; 없으면 클릭 무동작+title만 — 과설계 금지).
- 위치: `right-panel-settings`의 첫 자식. `role="status"` 금지(라이브리전 소음), 단순 `<div className="provider-status-strip">`.

## 2. `GenerationControlsPanel.tsx` (MODIFY)

구조 변경 (180행대 return 블록):

```tsx
// before
<div className="right-panel-settings" role="tabpanel">
  <ProviderSelect allowGrok />
  <details className="provider-compat-details">…</details>
  {isGrok && (…)}
  …코어 전용 컨트롤 나열…
// after
<div className="right-panel-settings" role="tabpanel">
  <ProviderStatusStrip />
  <ProviderSelect allowGrok />
  {mcpProvider ? (
    <McpGenerationControls />
  ) : (
    <>
      <details className="provider-compat-details">…</details>
      …기존 코어 분기 그대로…
    </>
  )}
```

- `mcpProvider`는 `useAppStore((s) => s.mcpProvider ?? null)` 구독 추가.
- **활성 상태 정합(감사 blocker 6):** `mcpProvider`가 설정된 동안 `ProviderSelect`의 코어 프로바이더 버튼은 선택 styling을 해제(`aria-pressed={false}` + inactive 클래스) — 코어와 Runway가 동시에 활성으로 보이는 상태 금지. 코어 버튼 클릭은 기존 `setProviderImpl`이 MCP 레인을 clear하므로 동작 변경 없음. `ProviderSelect`에 `muteSelection?: boolean` prop 추가(GenerationControlsPanel이 `Boolean(mcpProvider)` 전달).
- ProviderSelect가 MCP 프로바이더 선택을 표현하지 못하면(코어 Provider union만 앎) 탭 위에 "Runway (MCP)" 활성 배지를 McpGenerationControls 헤더에 표시하는 것으로 충분 — Provider union 확장은 명시적 비범위(이전 사이클 결정 유지).

## 3. `McpGenerationControls.tsx` (NEW)

- 헤더: 프로바이더 표시명 + 연결 상태 뱃지 + [사이드바에서 해제] 버튼(`setMcpProviderImpl(null)`).
- kind 토글: Image | Video 세그먼트 → `setMcpMediaKindImpl`. (010 라우팅 원칙의 보조 토글.)
- MODEL: `getMcpModelCatalog(provider)`에서 현재 kind의 목록을 버튼 그리드(기존 `OptionGroup` 재사용)로. 선택 → `setMcpModelWithKindImpl(model, kind)`.
- RATIO(감사 blocker 7 완화 + R2-1): Runway 계약엔 ratio enum이 없고 "모델별 상이" 설명뿐 → 기본값 **Auto = ratio 미전송**. 프리셋은 보수적 3종(`16:9`, `9:16`, `1:1`). 업스트림 거부 시 현행 UI는 오류 code를 무시하고 일반 `mcp.generateFailed` 토스트만 띄운다(`storeSettingsImpl.ts:40`) — code별 사유 노출은 비범위 잔여(001 기록).
- **`mcpRatio` 상태 수명(R2-1, R3-1 완결):**
  - `storeTypes.ts`: 상태 `mcpRatio: string | null`(null=Auto) + 액션 `setMcpRatio(ratio: string | null)` + **`GenerationDefaults` 타입에 `mcpRatio?: string | null` 추가**.
  - `useAppStore.ts`: 초기값은 `storedGenerationDefaults.mcpRatio ?? null`(무조건 null 아님 — 저장값 우선) + 액션 바인딩.
  - `storePersistence.ts` `loadGenerationDefaults` 파싱: 허용값 whitelist — `"16:9" | "9:16" | "1:1"`만 수용, 그 외 문자열/타입은 **null(Auto)로 정규화**.
  - `storeSettingsImpl.ts`: `setMcpRatioImpl` = `saveGenerationDefaultsPatch({ mcpRatio })` + `set({ mcpRatio })`; `clearMcpLane`은 in-memory reset뿐 아니라 **`saveGenerationDefaultsPatch({ mcpRatio: null })`로 저장값도 제거**.
  - **payload 조립 소유권(R4-1):** ratio 대체는 `runMcpGenerate`가 아니라 **`buildMcpGenerationInput`**(010 seam) 안에서 — 010의 임시 kind별 ratio 파생을 helper 내부에서 `state.mcpRatio ?? undefined`(Auto=키 생략)로 교체한다. `runMcpGenerate`는 계속 결과 전달만 하는 forwarder(payload 조립 금지).
  - 테스트: 영속 restore(whitelist 통과/정규화)와 clear-to-Auto(저장값 null 확인)를 `tests/mcp-media-kind-behavior.test.ts`에 추가(030이 이 파일을 확장 — 소유 명시).
- Higgsfield: 잠금 안내(`mcp.higgsfieldLocked`)만 렌더, 컨트롤 비활성.
- Est. cost: v1 생략(계약에 가격 정보 없음) — placeholder 금지.

## 4. 스타일 (`right-panel.css` MODIFY)

- `.provider-status-strip`: flex wrap, gap 6px, 점 6px 원, 라벨 11px mono, 하단 1px 구분선.
- `.mcp-generation-controls` 섹션 간격은 기존 `.option-group` 리듬 준수.

## 5. 테스트

- 패널 계약: mcpProvider 활성 시 McpGenerationControls 렌더/코어 컨트롤 미렌더, status 스트립이 첫 자식 (기존 layout-contract 소스 계약 방식).
- 행동 테스트(R2-3/R3-2): Auto ratio 생략(`mcpRatio=null` → payload에 ratio 키 부재)과 프리셋 전송은 010의 순수 `buildMcpGenerationInput` 헬퍼 테스트로 커버(`tests/mcp-media-kind-behavior.test.ts` — 010 신설, 030 확장). layout 하네스에서 mock 렌더 금지.
- 폴러 중복 방지(minor): `useMcpProviders()`는 GenerationControlsPanel에서 1회 호출해 ProviderStatusStrip/McpGenerationControls에 props로 전달(10초 폴러 다중 인스턴스 방지).

## 완료 기준

- 스크린샷: status 스트립 최상단 + Runway 선택 시 MCP 섹션(video 모델 6종 그리드) 증적.
- typecheck/tests/ui build 통과, baseline 유지.
