---
title: "060 — 현재 상태 및 재개 가이드"
lane: "260716_cli-entry-routing"
status: "wp1~wp4 완료 · wp5 로드맵 확장(051) 반영 · 구현 대기"
updated: "2026-07-20"
evidence: "2026-07-18 closeout-sweep audit + 2026-07-20 wp4 구현 루프(1772/1772 green)"
---

# 060 — CLI 진입점 라우팅: 현재 상태 및 재개 가이드

2026-07-18 closeout-sweep 기준, 이 lane은 **wp1~wp3 구현 완료** 상태다. 다음 실제 구현 단위는 wp4 캐릭터 영속성이고, wp5는 이미 있는 Runway media-action 위에 파생 UX/CLI를 추가하는 순서가 가장 안전하다.

## 현재 상태

| WP | 상태 | 완료/잔여 범위 | 증거 / 커밋 |
|---|---|---|---|
| wp1 | 완료 | strict model routing, fail-closed 기본 모델, 모델/도구 dispatch | `80da5e7`; 모델/도구 dispatch 후속은 `4505642` |
| wp2 | 완료 | CLI 문서·스킬 이관 및 버전 갱신 | `21b9b9b` |
| wp3 | 완료 | end frame·이미지/비디오 레퍼런스의 서버 계약, inputRoles 게이트, UI 슬롯, CLI 연동 | `a878e74`; 잔여 타입/카탈로그/UI 스타일은 `4505642`; [Gen-4 Turbo 슬롯 증거](evidence-wp3-gen4turbo-slots.png), [Seedance 슬롯 증거](evidence-wp3-seedance-slots.png) |
| wp4 | 구현 완료 (라이브 생성 증거만 보류) | 042-046 슬라이스 전부 랜딩: 저장 모델(lib/characterBindings.ts, 409 REFS_BOUND 가드), /api/mcp/generate characterElementId(lib/mcp/characterRefs.ts, 충돌/cap/NOT_READY 게이트), UI 카드+슬롯(CharacterBindingsCard/McpCharacterSlot), CLI --character(bin/lib/characterResolve.ts). 남은 것: 041 Accept 6의 Runway 실생성 1건(사용자 승인·과금)뿐 | `7dec392` `813b5a2` `3d9c046` `b0f6cb6` `d33354e` `4af8555`; 전체 스위트 1772/1772; [바인딩 카드 증거](evidence-wp4-bindings-card.png) |
| wp5 | 로드맵 확장 완료 · 부분 기반 | 050 스펙 + [051 amendment](051_wp5-roadmap-expansion.md)(long-job 파이프라인 탑승, preview lineage 확장, ResultActions/stage 부착). multishot·keyframe preview·CLI·UI·Higgsfield 파생 기능은 미구현 | `lib/mcp/mediaWorkflowRouter.ts:27-35`, `lib/mcp/adapters/runway.ts:200-214` |

wp3 후속 `4505642`에는 `ui/src/lib/mcpProviders.ts`의 end-frame/reference-video typed inputRoles, `mcp-models-catalog`의 `audio_references` 부정 assertion, 오른쪽 패널 reference-slot 스타일이 포함된다.

## 남은 작업 순서

### 1. wp4 — 캐릭터 영속성 전체 구현

`040_character-persistence.md`의 조사 결론 위에 [041](041_wp4-roadmap-expansion.md)의
amendment(저장 모델/Accept 치환)를 적용한다. 충돌 시 041 우선.

1. **저장 모델** — `element(kind=character)` 메타데이터에 `CharacterProviderBinding`을 저장·조회한다. provider, `stateless-refs`/`trained-id`, 원본 `refFilenames`, Runway tag, Higgsfield `externalId`(`soul_id`)와 학습 상태를 보존하고 roundtrip 계약 테스트를 먼저 고정한다.
2. **MCP 요청 연결** — `characterElementId`를 `/api/mcp/generate`에 수용하고 결과 lineage에도 기록한다. 현재 `routes/mcpMedia.ts:224-227,337-345,408-437`은 start/end/reference/video 입력만 다루므로 여기서부터 연결한다.
3. **provider 브리지** — Runway는 binding의 원본 레퍼런스를 최대 3장 `referenceImages[{url,tag}]`로 매 생성마다 전개한다. Higgsfield는 결제/연결 조건을 확인한 뒤 `soul_id`를 생성 params로 전달하고, 학습 전·실패 상태는 실행 불가로 닫는다.
4. **UI** — character element 상세에 provider binding 카드(Runway tag, Higgsfield 학습/크레딧 상태)를 추가하고, `image_references`를 선언한 MCP 모델에서만 캐릭터 슬롯을 노출한다.
5. **CLI** — wp1 resolver 위에 `ima2 gen/video --character <element-id|name>`를 추가하고, 모델 capability·provider binding 미충족은 명시 에러로 fail-closed 처리한다.

### 2. wp5 — 파생 제작 다양성

`050_derivative-diversity.md`의 tool 분류 위에 [051](051_wp5-roadmap-expansion.md)의
amendment(preview lineage 확장, stage 호환, capabilities lock 표면화)를 적용한다.
새 병렬 라우터를 만들지 말고 기존 Runway native action 기반을 확장한다.

1. **wp5a / Runway P1** — `edit_video`에 keyframe 입력·프리뷰 승인 단계를 추가하고, `generate_multishot_video`을 storyboard→`shots[]` 흐름으로 실행 경로에 연결한다. 현재 multishot은 snapshot/skill에만 있고 실행 경로에는 없다.
2. **wp5b / Runway P2** — 기존 `video.upscale`/`image.upscale`에 provider 파라미터를 노출하고, UI 제어와 `ima2 edit-video`·`ima2 upscale` CLI 진입점을 추가한다.
3. **wp5c / Higgsfield 결제 후** — `motion_control`과 `reframe`을 먼저 검토하고 wp4의 캐릭터/Soul 흐름과 묶는다. `voice_change`·`dubbing`은 입력 음성 검증과 언어 선택이 독립 표면이므로 별도 단위로 분리한다.

## 재개 절차와 검증 게이트

1. `040_character-persistence.md`와 `050_derivative-diversity.md`의 계약·Accept를 다시 읽고, 현재 MCP tools/list 스냅샷과 provider 연결/결제 상태를 재확인한다.
2. wp4는 저장 roundtrip → 업로드 전 capability/binding 거부 → Runway refs+tag 요청 shape 및 lineage 순으로 계약·route 테스트를 추가한다. 실제 Runway/Higgsfield 생성은 승인된 과금 호출일 때만 1건으로 제한한다.
3. wp5는 기존 `mediaWorkflowRouter`/Runway adapter의 action 계약을 먼저 확장하고, 그 뒤 UI와 CLI를 같은 요청 계약으로 연결한다. multishot·keyframe preview는 실행 경로와 결과 카드까지 도달하는지 별도 확인한다.
4. 각 서브 phase 완료 전 `npm run typecheck`, `npm run typecheck:tests`, 영향 받은 `node --test` 계약, `npm run test:inventory`, `cd ui && npm run build`를 실행한다. 2026-07-18 closeout-sweep의 기준선은 전체 **1665/1665**, 두 typecheck, UI build green이다.
5. 실행 증거(요청 shape, lineage, UI 슬롯/결과 카드)를 해당 WP devlog에 남기고, 과금·결제 전제와 unverified provider 계약은 proven처럼 승격하지 않는다.

## 주의 — generic elementIds와 혼동 금지

wp4의 `characterElementId`는 `lib/generatePipeline.ts`의 core-image generic `elementIds`와 다른 계약이다. 전자는 **MCP/provider character binding**을 찾아 Runway 레퍼런스 재전송 또는 Higgsfield `soul_id`를 연결하고 lineage에 남기는 식별자다. generic element 주입을 그대로 재사용하거나 `elementIds`만 전달해서 wp4가 구현됐다고 판단하면 안 된다.
