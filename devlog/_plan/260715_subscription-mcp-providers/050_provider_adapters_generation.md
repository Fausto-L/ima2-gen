# 050 — 구독형 provider adapter와 생성 파이프라인

> **Post-interview canonical (2026-07-16).** WP5. **이 phase가 결과 ingest의 단일 소유자다** (A-audit blocker 4): normalized upstream 결과 → local artifact 저장 → sidecar metadata → history/gallery → SSE 이벤트 → lineage 기록의 전 구간을 `lib/mcp/executeMediaJob.ts`+`lib/mcp/downloadMediaResult.ts`가 소유하고, 기존 분산 지점(`lib/generatePipeline.ts:267-496`, `routes/video.ts:77-81,477-478`)은 이 계약을 소비하도록 정리한다. cross-provider 혼합 chain은 060 소유.

## 목적

WP1에서 official MCP schema가 확인되고 open-source MCP client 사용 조건을 통과한 Tier A provider를 기존 ima2 이미지·영상 생성 계약에 연결한다. adapter는 REST API client가 아니라 MCP tool schema를 ima2 capability로 번역하는 얇은 계층이다. 기본 범위는 Higgsfield·Runway다. Magnific은 가장 가까운 multi-model 비교군이지만 공식 문서가 제품/파이프라인에는 API를 안내하므로 open-source local MCP client 사용이 허용된다는 근거 없이는 이 phase에 진입하지 않는다. Recraft는 control image provider다. Krea·Ideogram·BFL은 동일 adapter 계약을 통과한 뒤 별도 작은 cycle로 추가할 수 있다. Pika experimental은 production adapter 범위 밖이다.

## Entry gate

- 해당 provider의 sanitized `tools/list` fixture가 존재한다.
- generation tool과 result/status tool이 식별됐다.
- 기존 plan credits 또는 별도 과금 방식이 UI copy에 확정됐다.
- output URL/embedded resource의 보존 정책이 확인됐다.

## File change map

| Op | Path | 변경 |
|---|---|---|
| NEW | `lib/mcp/providerAdapter.ts` | image/video request normalization과 result polling/download interface. |
| NEW | `lib/mcp/adapters/higgsfield.ts` | verified tool schema만 매핑. CLI schema는 fallback 근거로 사용하지 않음. |
| NEW | `lib/mcp/adapters/runway.ts` | verified Runway generation/status/result mapping. |
| NEW | `lib/mcp/adapters/magnific.ts` | entitlement/live schema와 product-integration 허용 근거가 모두 확인된 경우에만 image/video generation 및 editor/result mapping. |
| NEW | `lib/mcp/adapters/recraft.ts` | 공개/live schema 기반 image generate/edit/upscale mapping. |
| NEW | `lib/mcp/executeMediaJob.ts` | tools/call, long-running task/poll, abort, output extraction, normalized error. |
| NEW | `lib/mcp/downloadMediaResult.ts` | signed URL 즉시 download, size/type/redirect/timeout 검증. |
| MODIFY | `lib/providerOptions.ts` | MCP provider id를 generic `oauth` fallback으로 축소하지 않고 registry로 위임. |
| MODIFY | `lib/generatePipeline.ts` | provider별 분기 앞에서 adapter path를 호출하고 기존 artifact/metadata 저장을 재사용. |
| MODIFY | `lib/multimodePipeline.ts` | MCP image provider batch를 기존 partial/allSettled 계약에 연결. |
| MODIFY | `lib/nodeGeneration.ts` | Node image job의 provider adapter 경로. |
| MODIFY | `lib/agentImageVideoGen.ts` | Agent가 선택한 MCP provider를 같은 normalized request로 호출. |
| MODIFY | `routes/edit.ts` | capability가 있는 MCP image edit를 adapter로 전달. |
| MODIFY | `routes/video.ts` | Grok-only guard를 capability guard로 바꾸고 MCP video generate 결과를 기존 저장/SSE 계약에 넣음. |
| MODIFY | `ui/src/types.ts` | hardcoded 6-value provider union을 registry-derived stable ids와 unknown-safe persisted type으로 교체. |
| MODIFY | `lib/capabilities.ts` | 연결된 MCP provider/capability를 노출하되 secrets/schema 원문은 제외. |
| NEW | `tests/mcp-provider-adapters.test.ts` | fixture별 request/result/error normalization. |
| NEW | `tests/mcp-generation-integration.test.ts` | image/video route→mock MCP→download→sidecar→SSE. |

## Metadata contract

```json
{
  "provider": "higgsfield-mcp",
  "providerTransport": "mcp-streamable-http",
  "providerTool": "<verified tool name>",
  "providerToolSchemaHash": "sha256:...",
  "model": "<effective model>",
  "upstreamJobId": "<safe id>",
  "providerUrl": "<non-secret canonical page or omitted>",
  "billingMode": "subscription-credits",
  "capabilitiesUsed": ["video.generate"]
}
```

signed download query와 token은 sidecar에 저장하지 않는다.

## Conditional activation scenarios

- Result URL 만료: mock URL 첫 응답이 403이면 provider result tool을 한 번 재조회하고 새 URL을 즉시 내려받는다.
- MIME mismatch: video tool이 image content-type을 반환하면 파일 쓰기 전에 `MCP_RESULT_TYPE_MISMATCH`로 실패한다.
- Partial batch: 4개 중 1개 실패 시 기존 allSettled contract로 3개를 저장하고 failure summary를 낸다.
- Schema hash mismatch: request 전에 현재 hash가 fixture/adapter hash와 다르면 tools/call을 하지 않는다.
- Cancel: provider task cancel tool이 있으면 upstream cancel; 없으면 local wait/download만 중지하고 `upstreamCancelUnsupported`를 기록한다.

## Acceptance criteria

- Classic/Node/Agent/Multimode가 서로 다른 MCP 호출 코드를 복제하지 않는다.
- 생성 결과는 signed URL이 만료되기 전에 local generatedDir에 저장된다.
- 기존 history/gallery/metadata에서 MCP 산출물이 GPT/Grok 산출물과 동일하게 열린다.
- provider tool text payload가 prompt 또는 token을 log에 노출하지 않는다.
- 실제 credit을 쓰는 smoke는 사용자 승인 후 provider당 최소 image 1건/video 1건으로 제한하고 비용 전후를 기록한다.
- 모든 upstream media 호출이 official MCP `tools/call`을 거치며 provider REST endpoint 직접 호출이 없다.

## Verification

```bash
npm run typecheck
npm run typecheck:tests
node --test --import tsx tests/mcp-provider-adapters.test.ts tests/mcp-generation-integration.test.ts
npm test
npm run test:inventory
```
