# 260716 MCP 모델 표면·UI 3종 리팩토링 — 로드맵

세션: 019f65ff-2065-7363-a253-09185ba7f06b (HOTL, goalplan `ima2-gen-mcp-ui-3-hotl-wp0-docs-only-devlog-plan`)
선행 유닛: `devlog/_plan/260715_subscription-mcp-providers/` (WP1~8 완료, 커밋 `6b07145`까지)

## 증상 (사용자 브라우저 코멘트 2건 + 구두 지시)

1. "runway mcp에서 seedance나 이런거 다 지원하는데 도대체 어디로 가버린거고 모든 모델들을 그거에 맞게 불러오라" — Runway를 선택해도 video 모델(seedance-2 등)이 셀렉터에 안 뜸.
2. 코멘트 1 (`div.image-model-select--sidebar`): 사이드바 프로바이더/모델 드롭다운(네이티브 `<select>` 2개)의 디자인 품질 불만 → 커스텀 재설계.
3. 코멘트 2 (`div#right-panel-tab-settings > div.right-panel-settings`): 우측 Settings 탭을 "프로바이더 별로 바뀌게" 리팩토링 + status는 Settings 최상단으로.

## 근본 원인 (조사 증거)

- `ui/src/components/GenProviderModelSelect.tsx:57` — `const mediaKind = videoModel ? "video" : "image"`. `videoModel`은 코어 레인의 `videoModelSelected`라서 MCP 레인 **in-lane kind 제어가 없다**. MCP 선택 상태에서 kind는 코어 잔존 상태에서 누출된다: 코어에서 video 모델을 골랐다가 MCP로 넘어오면 video enum이, 아니면 image enum만 로드된다(감사 blocker 1 — "절대 안 됨"이 아니라 "제어 불가+누출"). 결과적으로 일반 경로에서 seedance 등 video 6종이 보이지 않는다.
- `ui/src/store/storeSettingsImpl.ts:28` — `runMcpGenerate`도 동일 파생(`state.videoModelSelected ? "video" : "image"`). 모델만 고쳐도 생성 kind가 어긋나고, 코어 상태 누출이 그대로 생성 kind가 된다.
- MCP 선택 영속은 `storePersistence.ts`의 generation defaults 객체(`loadGenerationDefaults`/`saveGenerationDefaultsPatch`) 안에 산다 — kind 추가 시 이 체인(타입·파싱·초기화·액션 바인딩 `useAppStore.ts`)을 한 번에 바꿔야 한다(blocker 2).
- 계약 자체는 정상: `assets/mcp-snapshots/runway.sanitized.json` `generate_video.model.enum = [seedance-2, kling-o3-pro, kling-3-pro, gen-4.5, veo-3.1, gen-4-turbo]`, `generate_image.model.enum = [nano-banana-pro, gpt-image-2, gen-4]`. `lib/mcp/adapters/runway.ts:12-13` 동일.
- `getMcpModelOptions` (`ui/src/lib/mcpProviders.ts:123`)는 `/api/contracts/mcp.<provider>.generate_<kind>`에서 enum을 읽음 — kind만 제대로 주면 서버 변경 불필요.

## 비디오 모델 라우팅 문서화 (사용자 요구: "라우팅을 어떻게 할지도 고려해서 문서화")

| 모델 | 레인 | kind | 실행 경로 |
|------|------|------|-----------|
| grok-imagine-video (grok video) | core | video | routes/video.ts (기존) |
| seedance-2, kling-o3-pro, kling-3-pro, gen-4.5, veo-3.1, gen-4-turbo | mcp:runway | video | POST /api/mcp/generate → lib/mcp/adapters/runway.ts generate_video |
| nano-banana-pro, gpt-image-2, gen-4 | mcp:runway | image | POST /api/mcp/generate → generate_image |
| higgsfield 전 모델 | mcp:higgsfield | — | 결제 전 잠금 (`MCP_EXECUTION_LOCKED`), 셀렉터에서 disabled |

라우팅 원칙: **모델이 kind를 결정한다.** UI는 프로바이더별 image/video enum을 모두 로드해 그룹으로 노출하고, 사용자가 모델을 고르면 `mcpMediaKind`가 그 모델의 소속 그룹으로 설정된다. 별도 kind 토글은 우측 패널(030)에서 보조로 제공.

## 작업 phase 맵 (의존 순서)

| Phase | 문서 | 내용 | 의존 |
|-------|------|------|------|
| 010 | `010_mcp-model-surface.md` | store에 `mcpMediaKind` 도입, 프로바이더별 image+video enum 병렬 로드, 모델 그룹 노출, 생성 kind 정합 | 없음 |
| 020 | `020_sidebar-dropdown.md` | 사이드바 네이티브 select 2개 → 기존 `controls/Select` 그룹·portal 확장으로 교체 (코멘트 1) | 010 (모델 그룹 데이터 구조) |
| 030 | `030_settings-panel.md` | 우측 Settings: status 스트립 최상단 + 프로바이더별 섹션 + Runway MCP 컨트롤 (코멘트 2) | 010 (kind/카탈로그), 020과 독립 |

## 제약

- Higgsfield 과금 호출 금지(read-only), Runway 실 호출 최소.
- git push 금지, 로컬 커밋만. 병행 미커밋 변경(storeAssetsImpl/storeGenImpl/storeVideoImpl elementIds, bin/commands/*, config.js, lib/assetsStore.ts) 보존·미포함.
- 테스트 baseline 1416 pass / 2 fail (asset lightbox, structure counts — 병행 작업 소유).
- 테스트 서버: `IMA2_PORT=3435 IMA2_MCP_TOKEN_DIR=$HOME/.ima2/mcp-spike node --import tsx server.ts` (관리형 exec 세션).

## 검증 매트릭스

| 항목 | 명령 |
|------|------|
| 타입 | `npm run typecheck && npm run typecheck:tests` |
| 테스트 | `npm test` (baseline 유지 + 신규 통과) |
| UI 빌드 | `cd ui && npm run build` |
| 계약 문서 | `node scripts/generate-contract-docs.mjs --check` |
| 시각 증적 | 3435 서버 + agbrowse 스크린샷 (020/030) |

## 감사 이력

- round 1: sol/high FAIL → blocker 7건, synthesis `001_audit_synthesis.md`, 본 로드맵 v2로 반영.
- round 2: sol/high FAIL → blocker 4건(R2-1~4) + minor 4건, synthesis 001에 추가, 로드맵 v3로 반영.
