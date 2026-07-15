# 060 — provider-native 미디어 workflow, local fallback, 혼합 파이프라인

> **Post-interview canonical (2026-07-16).** WP6. **혼합 파이프라인(cross-provider chain)의 단일 소유자다** (A-audit blocker 4): GPT/Grok 이미지 → MCP provider I2V, MCP 영상 → 다른 provider stitch 같은 chain은 이 phase의 lineage(`lib/videoContinuity.ts`, `lib/videoSeriesChain.ts`) 계약 위에서 정의되며, 각 단계의 결과 ingest 자체는 050 계약을 재사용한다. 혼합 chain의 accept 기준: 어떤 provider 조합이든 parent/root/series/input lineage가 복원되고 중간 산출물이 다음 단계의 유효 입력으로 검증된다.

## 목적

MCP가 실제 제공하는 편집 도구를 ima2 action으로 연결하고, 없는 기능은 현재 local primitive로 안전하게 보완한다. marketing page에만 있는 기능은 노출하지 않는다.

## Operation selection

```text
user action
  -> capability registry
     -> native MCP tool (verified)
     -> frame continuation fallback (last frame -> I2V)
     -> local deterministic media op (ffmpeg concat/trim)
     -> unavailable + reason
```

## File change map

| Op | Path | 변경 |
|---|---|---|
| NEW | `lib/mcp/mediaWorkflowRouter.ts` | native/fallback/unavailable 결정을 한 곳에서 수행하고 decision metadata를 반환. |
| NEW | `lib/mcp/adapters/mediaActions.ts` | provider별 verified extend/stitch/reframe/upscale/edit tool mapping. |
| NEW | `lib/videoConcat.ts` | ordered MP4 probe/normalize/concat, temp cleanup, cancellation. transition은 별도 capability. |
| MODIFY | `routes/videoExtended.ts` | provider와 capability를 받아 native extend/edit 또는 fallback router 사용; blocking JSON을 async 202+eventBus로 정규화. |
| MODIFY | `lib/videoFrameExtract.ts` | continuation-owned temp artifact와 precise last-frame probe 계약. |
| MODIFY | `lib/videoContinuity.ts` | operation kind(native-extend/frame-continue/stitch/reframe/upscale)와 parent/inputs lineage. |
| MODIFY | `lib/videoSeriesChain.ts` | multi-input stitch lineage와 branch sequence 조회. |
| MODIFY | `ui/src/components/ResultActions.tsx` | capability별 `이어가기`, `AI 연장`, `합치기`, `리프레임`, `업스케일` action. 용어 분리. |
| MODIFY | `ui/src/store/storeVideoImpl.ts` | async workflow request/SSE/cancel/retry state. |
| NEW | `tests/mcp-media-workflow-router.test.ts` | native/fallback/unavailable 결정표. |
| MODIFY | `tests/videoExtendedRoute.test.ts` | MCP native extend, frame fallback, concat, cancellation, lineage. |
| NEW | `tests/video-concat.test.ts` | codec mismatch, ordering, corrupt input, cleanup, abort. |

## Native 기능 gate

- Higgsfield AI Video Extender 제품이 존재한다는 사실만으로 `video.extend.native`를 켜지 않는다.
- Runway Workflow의 Stitch node가 존재한다는 사실만으로 MCP `video.stitch`를 켜지 않는다.
- provider `tools/list`에 tool이 있고 input schema가 adapter matcher를 통과해야 켠다.
- natural-language agent tool 하나만 제공하는 provider는 deterministic field mapping이 검증되지 않으면 editor lane으로 분리한다.

## Fallback contract

- `video.continue.frame`: 현재 source의 local MP4를 검증하고 마지막 프레임 PNG를 추출해 같은 provider의 I2V start frame으로 보낸다.
- `video.stitch`: local ffmpeg concat은 codec/container가 호환될 때 stream-copy를 우선하고, 불일치 시 명시적 normalize policy가 있을 때만 transcode한다.
- `video.reframe`: 단순 crop/resize와 generative outpaint를 다른 action으로 표시한다.
- fallback은 provider-native라고 metadata에 기록하지 않는다.

## Conditional activation scenarios

- Native tool absent: fixture에서 extend tool을 제거했을 때 frame fallback이 정확히 1회 실행되고 native tools/call은 0회여야 한다.
- Corrupt parent: MP4 header/probe 실패 시 frame extraction과 provider call 모두 시작하지 않는다.
- Multi-input stitch mismatch: 서로 다른 FPS/audio layout에서 silent corruption 대신 normalize-required error 또는 계획된 transcode가 실행된다.
- Cancel during upload/poll/download/ffmpeg: 각 phase에서 temp와 inflight가 정리되고 done이 발행되지 않는다.
- Orphan output: media file 저장 성공 후 lineage write 실패 시 diagnostic과 repair pointer를 남긴다.

## Acceptance criteria

- 사용자가 AI 연장과 단순 합치기를 구분할 수 있다.
- provider-native와 fallback 결과 모두 parent/root/series/input lineage를 복원할 수 있다.
- native tool이 사라져도 unrelated generation은 계속 동작한다.
- local concat은 원본 순서를 보존하고 산출물 duration이 허용 오차 안에 있다.

## Verification

```bash
npm run typecheck
npm run typecheck:tests
node --test --import tsx tests/mcp-media-workflow-router.test.ts tests/videoExtendedRoute.test.ts tests/video-concat.test.ts
npm test
```
