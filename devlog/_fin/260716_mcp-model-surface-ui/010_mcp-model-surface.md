# 010 — MCP 모델 표면 정합 (mcpMediaKind + 프로바이더별 image/video 카탈로그)

목표: MCP 프로바이더 선택 시 image·video 모델 enum을 **둘 다** 로드해 그룹으로 노출하고, 선택된 모델이 생성 kind를 결정하게 만든다. Runway 기준 video 6종 + image 3종이 전부 셀렉터에 보여야 한다.

## 변경 파일 목록

| 파일 | 종류 | 내용 |
|------|------|------|
| `ui/src/store/storeTypes.ts` | MODIFY | `mcpMediaKind` 상태 필드 추가 |
| `ui/src/store/storePersistence.ts` | MODIFY | GenerationDefaults 타입·`loadGenerationDefaults` 파싱·`loadMcpSelection`/`saveMcpSelection`에 kind 포함 |
| `ui/src/store/useAppStore.ts` | MODIFY | `mcpMediaKind: "image"` 초기화 + `setMcpMediaKind` 액션 바인딩 |
| `ui/src/store/storeSettingsImpl.ts` | MODIFY | kind setter + `runMcpGenerate` kind/ratio 정합 |
| `ui/src/lib/mcpProviders.ts` | MODIFY | `getMcpModelCatalog()` 신설 (image+video 병렬 fetch, abort/오류 의미론 명시) |
| `ui/src/lib/mcpSelection.ts` | NEW | 순수 헬퍼 (model value 인코딩/파싱, kind 폴백) — 단위 테스트 대상 |
| `ui/src/components/GenProviderModelSelect.tsx` | MODIFY | 카탈로그 로드 + optgroup 2개 노출 + 선택 시 kind 설정 |
| `tests/mcp-provider-ui-contract.test.js` | MODIFY | kind 파생/영속/카탈로그 계약 케이스 추가 |
| `tests/mcp-selection-helpers.test.ts` | NEW | 순수 헬퍼 단위 테스트 (tsx import) |
| `tests/mcp-media-kind-behavior.test.ts` | NEW | 행동 테스트 (fake localStorage/fetch, 순수 seam 경유) — 030이 ratio 케이스로 확장 |

## 1. `ui/src/store/storeTypes.ts` (MODIFY)

`mcpProvider`/`mcpModel` 선언부(195-196행) 옆에 추가:

```ts
// before
  mcpProvider: string | null;
  mcpModel: string | null;
// after
  mcpProvider: string | null;
  mcpModel: string | null;
  mcpMediaKind: "image" | "video";
```

액션 타입(451-452행 부근 settings slice)에도 `setMcpMediaKind(kind: "image" | "video"): void` 추가. `McpMediaKind` 타입 별칭은 `storeTypes.ts`에서 export.

## 2. `ui/src/store/storePersistence.ts` (MODIFY)

MCP 선택은 generation defaults 객체 안에 산다. 체인 전체를 함께 변경:

- `GenerationDefaults` 타입(및 `loadGenerationDefaults` 파싱)에 `mcpMediaKind?: "image" | "video"` 추가 — 파싱 시 `"video"`가 아니면 전부 `"image"` 폴백(구버전 값 호환).
- 382행 `loadMcpSelection` / 390행 `saveMcpSelection` 확장:

```ts
// before
export function loadMcpSelection(): { provider: string | null; model: string | null }
export function saveMcpSelection(provider: string | null, model: string | null): void
// after
export function loadMcpSelection(): { provider: string | null; model: string | null; kind: "image" | "video" }
export function saveMcpSelection(provider: string | null, model: string | null, kind: "image" | "video" = "image"): void
// saveMcpSelection 본문: saveGenerationDefaultsPatch({ mcpProvider: provider, mcpModel: model, mcpMediaKind: kind })
```

`clearMcpLane`은 `saveMcpSelection(null, null, "image")`로 kind까지 리셋한다.

## 2b. `ui/src/store/useAppStore.ts` (MODIFY)

- 스토어 초기 상태에 `mcpMediaKind: "image"`.
- 액션 바인딩: `setMcpMediaKind: (kind) => setMcpMediaKindImpl(kind, set, get)` (기존 setMcpProvider/setMcpModel 바인딩과 같은 자리).

## 3. `ui/src/store/storeSettingsImpl.ts` (MODIFY)

- 초기값: `clearMcpLane`의 `set({...})`에 `mcpMediaKind: "image"` 포함(스토어 초기값은 2b에서).
- 신규 `setMcpMediaKindImpl(kind, set, get)`: kind가 바뀌면 `mcpModel`을 null로 리셋(다른 kind의 enum에 속한 모델이 남는 것 방지), `saveMcpSelection(provider, null, kind)` 후 `set({ mcpMediaKind: kind, mcpModel: null })`.
- 신규 `setMcpModelWithKindImpl(model, kind, set, get)`: 모델 선택이 kind를 함께 확정하는 경로(셀렉터 optgroup에서 사용). `saveMcpSelection(provider, model, kind)` + `set({ mcpModel: model, mcpMediaKind: kind })`.
- `runMcpGenerate` 28행:

```ts
// before
  const kind = state.videoModelSelected ? "video" : "image";
// after
  const kind = state.mcpMediaKind;
```

ratio 인자(36행)는 010에서는 파생 kind만 정합: `ratio: kind === "video" ? state.videoAspectRatio : state.grokAspectRatio`. `startFrameFilename`도 동일 조건 유지. (030에서 MCP 전용 `mcpRatio` 필드로 대체 — Auto 시 ratio 생략. 010은 kind 버그만 고친다.)

**생성 입력 순수 seam(R3-2):** `runMcpGenerate`는 `startMcpGeneration`을 정적 호출하고 그 경로는 EventSource(subscribe)를 요구해 Node 하네스에서 실행 불가. 입력 조립을 순수 함수로 분리한다 — `ui/src/lib/mcpSelection.ts`에:

```ts
export function buildMcpGenerationInput(state: Pick<AppState, "mcpProvider" | "mcpModel" | "mcpMediaKind" | "videoAspectRatio" | "grokAspectRatio" | "currentImage" | "prompt" | "insertedPrompts">): McpGenerateInput | null
```

`runMcpGenerate`는 `buildMcpGenerationInput(state)` 결과를 `startMcpGeneration`에 그대로 전달만 한다. kind/model/ratio(030에서 Auto 생략 포함)/startFrame 로직은 전부 이 순수 함수 안 — Node에서 직접 테스트 가능. (composePrompt 의존은 파라미터로 받거나 함수 내 재사용 — 브라우저 전역 불요 확인.)
- `setMcpProviderImpl`(R2-4 확정 규칙): 시그니처 `(mcpProvider, set, get, persistedModel: string | null = null, persistedKind?: "image" | "video")`. **persistedKind 생략(라이브 UI 3/4-인자 호출) 시 `get().mcpMediaKind`에서 해석** → 프로바이더 전환은 현재 kind 유지. `hydrateMcpSelectionImpl`만 저장값을 명시 전달. `saveMcpSelection` 호출부는 해석된 kind로 3-인자.
- `setMcpModelImpl`: 기존 export 유지 — 내부에서 `saveMcpSelection(provider, model, get().mcpMediaKind)`로 위임(kind 불변 경로).
- `hydrateMcpSelectionImpl`: `loadMcpSelection().kind`를 전달.

## 4. `ui/src/lib/mcpProviders.ts` (MODIFY)

`getMcpModelOptions` 아래 신설:

```ts
export type McpModelCatalog = { image: string[]; video: string[] };
export async function getMcpModelCatalog(provider: string, signal?: AbortSignal): Promise<McpModelCatalog> {
  const settle = async (kind: "image" | "video"): Promise<string[]> => {
    try {
      return await getMcpModelOptions(provider, kind, signal);
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") throw error; // abort는 삼키지 않고 전파
      if ((error as { status?: number }).status === 404) return [];        // 계약 부재 = 해당 kind 없음
      throw error;                                                          // 그 외 오류는 상위로 (UI error 상태)
    }
  };
  const [image, video] = await Promise.all([settle("image"), settle("video")]);
  return { image, video };
}
```

오류 의미론(감사 blocker 3 반영): abort는 전파(호출측 effect가 무시), 404만 "kind 없음 → 빈 배열", 나머지 오류는 UI가 `catalogError` 상태로 노출하고 재시도 버튼 제공. stale race는 effect-local `AbortController` + `signal.aborted` 체크 후에만 setState.
(`jsonFetch`가 404를 status 필드로 던지는지 B에서 확인하고, 아니면 오류 코드 매칭으로 대체.)

## 5. `ui/src/components/GenProviderModelSelect.tsx` (MODIFY)

- 57행 `mediaKind` 파생 제거. MCP 레인은 `useState<McpModelCatalog>` + `catalogError` 상태로 카탈로그를 들고, effect는 `[mcpProvider, mcpSelectionAvailable]` 의존으로 `getMcpModelCatalog` 1회 로드.
- 모델 select(MCP 분기)를 optgroup 2개로:

```tsx
<optgroup label={t("mcp.imageModels")}>
  {catalog.image.map((m) => <option key={`img-${m}`} value={`img:${m}`}>{m}</option>)}
</optgroup>
{catalog.video.length > 0 ? (
  <optgroup label={t("mcp.videoModels")}>
    {catalog.video.map((m) => <option key={`vid-${m}`} value={`vid:${m}`}>{m}</option>)}
  </optgroup>
) : null}
```

- `onModelChange` MCP 분기: `img:`/`vid:` 접두사를 파싱해 `setMcpModelWithKindImpl(model, kind)` 호출. 현재 선택 value는 `mcpModel ? `${mcpMediaKind === "video" ? "vid" : "img"}:${mcpModel}` : ""`. 인코딩/파싱은 `ui/src/lib/mcpSelection.ts`의 순수 함수(`encodeMcpModelValue`/`parseMcpModelValue`)로 분리.
- **기존 보존 계약 유지(blocker 4):** `mcpModel`이 두 enum 어디에도 없으면 현행처럼 detached option(현재 kind 그룹 앞)으로 렌더, unavailable-provider disabled option 렌더 경로도 그대로 유지.
- 기존 `getMcpModelOptions(provider, kind)` 단건 호출은 이 컴포넌트에서 제거(함수 자체는 우측 패널·기타 소비자용으로 유지).
- i18n: `mcp.imageModels`/`mcp.videoModels` 키는 이미 존재(ko/en json) — 재사용.

## 6. 테스트 (`tests/mcp-provider-ui-contract.test.js` MODIFY)

주의: 이 테스트는 **소스 정규식 계약 방식**(파일 내용 `assert.match`)이다 — jsdom/렌더 하네스가 아니므로 mock 렌더 테스트는 불가(감사 확인). 54행이 `saveMcpSelection\(provider: string \| null, model: string \| null\)` 시그니처를 고정하고 있으므로 kind 파라미터 추가 시 이 assertion을 새 시그니처로 갱신해야 한다. `getMcpModelOptions`를 GenProviderModelSelect 안에서 찾는 기존 assertion도 `getMcpModelCatalog`로 갱신. 호출자 전수(2026-07-16 rg 검증): `storeSettingsImpl.ts`(56/78/90/95행)와 `GenProviderModelSelect.tsx`(32/36/60행)뿐 — 외부 호출자 없음.

테스트 전략 (하네스 현실 반영):

1. `tests/mcp-selection-helpers.test.ts` (NEW, tsx import **순수 모듈**): `encodeMcpModelValue`/`parseMcpModelValue` 왕복, kind 폴백(`"video"` 외 전부 image) 케이스.
2. `tests/mcp-media-kind-behavior.test.ts` (NEW, R2-3/R3-2 — jsdom 없이 plain TS): ① fake `localStorage`(globalThis 주입)로 영속 마이그레이션(kind 없는 구버전 defaults → image 폴백, kind 왕복), ② fake `fetch`로 `getMcpModelCatalog` 404→빈 배열·500→throw·abort→전파(카탈로그 경로는 EventSource 불요 — fetch만 사용), ③ **`buildMcpGenerationInput` 순수 테스트**: kind/model 매핑, provider 전환 시 kind 유지(R2-4), (030 확장) Auto 시 ratio 키 부재·프리셋 전송. `runMcpGenerate` 자체는 실행하지 않는다(EventSource 경로 — 하네스 밖).
3. `tests/mcp-provider-ui-contract.test.js` 소스 계약 추가: `runMcpGenerate`가 `state.mcpMediaKind`를 사용(정규식), `saveMcpSelection` 3-인자 시그니처, `loadGenerationDefaults`에 `mcpMediaKind` 파싱 존재, `GenProviderModelSelect`가 `getMcpModelCatalog` 사용 + `img:`/`vid:` 인코딩 존재.

## 완료 기준

- Runway 연결 상태에서 모델 셀렉터에 image 3종 + video 6종(총 9개 option) 노출.
- seedance-2 선택 → 생성 요청 body `kind:"video"`, `model:"seedance-2"`.
- typecheck/tests/ui build 통과, baseline 유지.
