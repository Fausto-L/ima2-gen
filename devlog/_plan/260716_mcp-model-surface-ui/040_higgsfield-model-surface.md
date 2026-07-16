# 040 — Higgsfield 모델 표면 (catalog-only browse, 생성 잠금 유지)

목표: 무료 플랜 잠금(MCP_EXECUTION_LOCKED)은 유지한 채, Higgsfield 모델명을 셀렉터와 Settings에서 browse 가능하게 한다. 모델 출처는 read-only `models_explore`(무과금, 051 실증 + 2026-07-16 재연결 실측: refresh로 connected 73 tools).

## 사실 관계 (조사 증거)

- `generate_image`/`generate_video` 스키마는 opaque `params` — 계약 enum 없음. 모델 목록은 `models_explore {action:"list", type:"image"|"video", limit:100}` (`type` enum: image/video/audio/3d, `after` 커서).
- 캡처 fixture: `tests/fixtures/mcp/higgsfield-models.sanitized.json` — `structuredContent.items[]` 20건(image 12 / video 6 / 3d 2; 항목엔 `id/name/description` 외 `provider_name/output_type/parameters/aspect ratios/tags` 등 포함 — `{id,label,description}`은 **투영**이지 원형이 아님). 1페이지, `has_more:true`, `next_page_token:"20"` → 페이지네이션 실존.
- 어댑터(`lib/mcp/adapters/higgsfield.ts`): `executable:false`, `HIGGSFIELD_BILLING_DENYLIST` — 불변.
- 현재 UI 차단 지점: `GenProviderModelSelect.tsx` — provider 항목 `disabled: entry.id === "higgsfield"`, `mcpSelectionAvailable`의 `selectedMcpRecord.id !== "higgsfield"`, `onProviderChange`의 higgsfield reject, `unavailableReason` higgsfieldLocked(모델 select disable). `McpGenerationControls.tsx` — `locked` 분기가 컨트롤 전체 숨김.

## 변경 파일

| 파일 | 종류 | 내용 |
|------|------|------|
| `lib/mcp/modelsCatalog.ts` | NEW | provider별 카탈로그 리졸버 + TTL 캐시 + 순수 파서 |
| `routes/mcpConnections.ts` | MODIFY | `GET /api/mcp/providers/:id/models` |
| `ui/src/lib/mcpProviders.ts` | MODIFY | 카탈로그 엔트리화({id,label}) + 서버 폴백 |
| `ui/src/components/GenProviderModelSelect.tsx` | MODIFY | higgsfield browse 언락, 엔트리 렌더 |
| `ui/src/components/settings/McpGenerationControls.tsx` | MODIFY | higgsfield 모델 그리드 + 잠금 배너, ratio는 runway 전용 |
| `ui/src/store/storeSettingsImpl.ts` | MODIFY | runMcpGenerate higgsfield 선차단 토스트 |
| `tests/mcp-models-catalog.test.ts` | NEW | fixture 파서 + 캐시/가드 단위 |
| `tests/mcp-media-kind-behavior.test.ts` | MODIFY | 카탈로그 엔트리 마이그레이션 + 200/빈-enum 폴백 트리거 테스트 (R1-2) |
| `tests/mcp-connection-routes.test.ts` | MODIFY | /models 200·404·409·upstream 실패·tool-name 비주입 (R1-3) |
| `tests/mcp-provider-ui-contract.test.js` | MODIFY | browse 언락/생성 가드/denylist 불변 계약 |

## 1. `lib/mcp/modelsCatalog.ts` (NEW)

```ts
export type McpModelEntry = { id: string; label: string; description?: string };
export type McpProviderModels = { image: McpModelEntry[]; video: McpModelEntry[] };
// 순수 파서 — fixture로 단위 테스트:
export function parseModelsExploreItems(result: Record<string, unknown>): McpModelEntry[];
// 리졸버: runway = 어댑터 정적 enum → 엔트리(id=label). higgsfield =
// callTool("higgsfield","models_explore",{action:"list",type,limit:100,after?}) —
// kind별 페이지네이션 루프(R1-5): has_more && next_page_token 동안 after 전달,
// id 중복 제거, 상한 kind당 3페이지/300항목, 동일 커서 반복 시 중단.
// READ-ONLY GUARD: 이 모듈이 호출할 수 있는 툴 이름은 "models_explore" 상수 하나뿐
// (READONLY_CATALOG_TOOL); 요청이 툴 이름에 영향을 줄 수 있는 파라미터 없음.
// abort/timeout(R1-4): getProviderModels(provider, deps, {signal, timeoutMs=20_000})
// → 모든 callTool에 전달. TTL 캐시 10분(성공 응답만), 실패는 캐시하지 않음.
export async function getProviderModels(provider, deps, opts): Promise<McpProviderModels>;
```

## 2. `routes/mcpConnections.ts` (MODIFY)

`GET /api/mcp/providers/:id/models`: 미지 provider→404 `MCP_PROVIDER_UNKNOWN`(canonical, providerRegistry), 미연결→409 `MCP_NOT_CONNECTED`, 성공→`{ok:true, models}` — 에러는 기존 `typedError`의 `{error:{code,message}}` envelope(R1-3). 요청 abort 브리지(R1-4): route-scoped AbortController를 `req`의 close/abort에 연결해 업스트림 models_explore 중단.

## 3. UI

- `McpModelCatalog`을 `{image: McpModelEntry[], video: McpModelEntry[]}`로 승격. `getMcpModelCatalog`: 계약 enum(문자열)을 엔트리로 매핑; **image·video 둘 다 비면** `GET /api/mcp/providers/:id/models` 폴백(오류 의미론 동일: abort 전파/404·409는 빈 카탈로그 아님 — catalogError).
- browse 언락: provider 항목 disabled 해제(sub는 `mcp.locked` 유지 — 생성 잠금 표시), `mcpSelectionAvailable`에서 higgsfield 예외 제거, `onProviderChange` reject 제거, `unavailableReason`에서 higgsfieldLocked를 **모델 select 비활성 사유에서 제외**하고 상태줄 안내로만 유지. 추가 차단 지점 2곳(감사 minor 2): 사이드바의 synthetic `higgsfield-locked` disabled 모델 행 **제거**(실 모델이 렌더되므로), Settings 카탈로그 effect의 `locked` 게이트 제거(잠금 배너는 유지).
- 모델 렌더: label=엔트리.label, value=`img:`/`vid:`+id (010 인코딩 불변).
- `runMcpGenerate`: `if (provider === "higgsfield") { showToast(t("mcp.higgsfieldLocked"), true); return; }` — 서버 잠금(어댑터)과 이중 방어.
- Settings: higgsfield에서 kind 토글+모델 그리드 렌더(선택 가능 — 결제 후 즉시 사용 가능한 상태 저장), 상단에 잠금 배너 유지, RATIO 섹션은 `provider === "runway"`일 때만.

## 4. 테스트

- `tests/mcp-models-catalog.test.ts`: fixture → `parseModelsExploreItems` 20건/{id,label,description} 투영, 캐시 TTL(성공만 캐시), READONLY_CATALOG_TOOL 외 호출 시도 없음(주입 mock callTool 호출 기록 검증), NOT_CONNECTED 전파, **2페이지 페이지네이션 + 동일/무효 커서 가드(R1-5), abort/timeout 전달(R1-4)**.
- `tests/mcp-connection-routes.test.ts`: /models 200(성공 envelope), 404 MCP_PROVIDER_UNKNOWN, 409 MCP_NOT_CONNECTED, upstream 오류 정규화, path/query가 툴 이름에 비영향(R1-3).
- `tests/mcp-media-kind-behavior.test.ts`: 카탈로그 엔트리 객체 마이그레이션 + **폴백 트리거 정밀 검증**: 두 계약 fetch가 200이고 top-level model enum이 없을 때(=higgsfield 실제 형상, params 중첩) 정확히 1회 `/api/mcp/providers/:id/models` 요청; AbortError·404/409 의미론 유지(R1-2).
- 소스 계약: GenProviderModelSelect에 higgsfield disabled 부재+locked sub 존재, storeSettingsImpl 선차단, adapters/higgsfield.ts denylist/executable:false 불변, modelsCatalog에 "models_explore" 단일 상수.

## 완료 기준

- 라이브: `curl /api/mcp/providers/higgsfield/models` → image/video 모델 배열(무과금 실측). UI에서 힉스필드 선택 → 모델명 browse 스크린샷.
- 게이트(R1-1 — stale 서버 JS 섀도 방지): `npm run typecheck` → `npm run typecheck:tests` → **`npm run build:server`** → focused MCP 테스트 → `npm test`(1436/2 baseline) → `cd ui && npm run build` → contract docs check, 이 순서로.
- 비범위: 생성 언락(결제 필요, NEEDS_HUMAN), audio/3d 카탈로그(백로그).

## 감사 이력

- round 1: sol/high NEAR-PASS(GO-WITH-FIXES, blocker 5) — 전부 수용, 본 문서 v2 반영. 증거 `.codexclaw/evidence/260716-higgsfield-040-plan-audit.md`.
