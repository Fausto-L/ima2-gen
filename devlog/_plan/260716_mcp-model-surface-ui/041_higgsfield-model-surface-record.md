# 041 — 040 구현 기록 (Higgsfield catalog-only browse)

## 구현 델타

- `lib/mcp/modelsCatalog.ts` (NEW): `READONLY_CATALOG_TOOL="models_explore"` 단일 상수 — 요청이 툴 이름에 영향 불가. kind별 페이지네이션(after 커서, 상한 3페이지/300항목, 반복 커서 가드), id 중복 제거, 20s 타임아웃 + signal 스레딩, 성공만 10분 TTL 캐시. runway는 정적 계약 enum 투영.
- `routes/mcpConnections.ts`: `GET /api/mcp/providers/:id/models` — 404 `MCP_PROVIDER_UNKNOWN` / 409 `MCP_NOT_CONNECTED` / 502 `MCP_UPSTREAM_ERROR` (`{error:{code,message}}` envelope), req close→AbortController 브리지.
- `ui/src/lib/mcpProviders.ts`: `McpModelCatalog`을 `{id,label,description?}` 엔트리로 승격, 계약 enum이 **둘 다 비면** 서버 카탈로그 1회 폴백(오류/abort 의미론 유지).
- browse 언락: `GenProviderModelSelect` — higgsfield disabled/선택 거부/synthetic locked 행 제거, `lockedNotice`는 상태줄로만(모델 select 비활성 아님). `McpGenerationControls` — 카탈로그 effect의 lock 게이트 제거, 잠금 배너 유지, RATIO는 runway 전용, 모델 버튼 title에 description.
- 생성 잠금 이중 방어: `runMcpGenerate`가 higgsfield면 `mcp.higgsfieldLocked` 토스트 후 즉시 반환(요청 미전송) + 서버 어댑터 `executable:false`/billing denylist 불변.

## 검증 증적 (감사 R1-1 순서 준수)

- typecheck → typecheck:tests → **build:server** → focused 44/44 → `npm test` **1449 pass / 2 fail(baseline)** → ui build 1.25s → contract docs check → test inventory check.
- 라이브(무과금, :3435 재기동 후): `GET /api/mcp/providers/higgsfield/models` → **image 31종 + video 30종**(페이지네이션 실동작, fixture 20건 1페이지 대비 증가 확인). refresh 토큰 재연결(73 tools, drift 없음).
- 브라우저: `assets-021/higgsfield-model-browse-open.png` — Higgsfield 선택(Locked sub) + IMAGE MODELS 그룹에 표시명(Nano Banana 2, Higgsfield Soul 2.0, Soul Cinema, DTC Ads …) browse, 상태줄 잠금 안내. 모델 선택+Generate 클릭 → 잠금 토스트 실측("Higgsfield is catalog-only for now; generation is locked."), `/api/mcp/generate` 요청 없음.

## 잔여

- 생성 언락은 결제 후(NEEDS_HUMAN — 사용자 결정): 어댑터 buildGenerateCall 구현 + Tier2 smoke가 그때의 사이클.
- audio/3d 카탈로그(models_explore type 필터 존재) 백로그.
