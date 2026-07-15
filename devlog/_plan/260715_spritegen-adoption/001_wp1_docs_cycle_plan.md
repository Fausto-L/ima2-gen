# 001 — WP1 docs-first 사이클 계획 (구현 없음)

Loop-spec: 아키타입=spec-satisfaction(문서 완결성). 트리거=사용자 루프 지시(pabcd 여러번,
전체 구현). 목표=010~050 전 문서를 diff-level PRD로. Non-goal=프로덕션 코드 패치.
Verifier=리뷰어 audit + 문서-트리 대조. Stop=5개 문서 diff-level 완결. 산출물=goalplan
워크페이즈 맵 잠금. 종료=DONE. 에스컬레이션=제품 결정 필요 항목은 문서에 NEEDS_HUMAN 표기.

## 문서 맵 (B에서 작성/승격할 것)

| 문서 | 상태 | 내용 |
|---|---|---|
| `010_keying_softalpha_unmix.md` | 승격 | softUnmix.ts NEW 시그니처, applyColorKey 통합 지점(콜사이트 diff), KeyingPanel 토글 diff, 테스트 목록, 활성화 시나리오 |
| `020_sprite_recipe_identity_pipeline.md` | 승격 | recipe 스키마 TS 타입, 스토어/라우트 NEW 파일, multimode 재사용 지점 MODIFY, anchor 저장 설계, UI 진입점. sol 조사(Bacon) 기반 |
| `030_atlas_manifest_curator_ux.md` | 승격 | manifest TS 타입, 합성/GIF 경로(ffmpeg vs 라이브러리 — 조사 결과 따름), 프리뷰 컴포넌트 위치, sidecar 저장 규약. sol 조사(Euler) 기반 |
| `040_cli_optimization.md` | 신규 | CLI 감사 결과(Peirce) 중 S/M 난이도만 확정 범위로, 하위호환 파괴 항목은 별도 표기. 계약 테스트 영향 목록 |
| `050_cli_default_models.md` | 신규 | 기본값 4개 변경: config.ts:263 `gpt-5.4-mini`→`gpt-5.6-luna`, :277 동일, :294 `grok-imagine-image`→`-quality`, :297 + lib/grokVideoAdapter.ts:108 `grok-imagine-video`→`-1.5`. 도움말 문구·테스트 기대값 동기화 목록 |

상세가 넘치면 011/021 식 서브 문서로 분리 (사용자 지시).

## 근거 조사 (P에서 확보)

- CLI/모델 실태: 본 문서 작성 시점에 직접 확인 — luna/quality/1.5 모델명 실존
  (bin/commands/gen.ts:12, config.ts:262-300, lib/grokVideoAdapter.ts:108,
  ui/src/types.ts:10). 기본값 변경 영향 테스트: tests/config.test.js,
  tests/image-model.test.ts, tests/grokVideoAdapter.test.ts 등 rg로 목록 확보.
- sol 병렬 조사 3건: Bacon(020 파일 맵), Euler(030 파일 맵), Peirce(040 CLI 감사).
  보고서는 B에서 문서 본문에 반영, 근거 file:line 유지.

## 수용 기준

1. 5개 문서 모두: 정확한 경로의 NEW/MODIFY 파일 맵 + 주요 시그니처/diff 스케치 +
   테스트 목록 + 조건부 경로의 활성화 시나리오 명시 (C-ACTIVATION-GROUNDING-01).
2. 문서 간 의존 순서 명시: 010→(040→050)→020→030 (구현 사이클 순서, PHASE-SPLIT-01
   기준 — 040이 CLI 구조를 정리한 뒤 050이 기본값을 얹는다).
3. 리뷰어 audit PASS: 문서가 현재 트리와 일치(라인 참조 stale 없음), 연구/구현 분리
   (LEXICO-SPLIT-01) 준수.
4. goalplan 워크페이즈 맵이 문서와 1:1 (D에서 잠금).

## OUT

- 코드 변경 일체 (다음 사이클부터).
- 260715_assetgen_ux_overhaul 레인 문서 수정 (독립 레인).

## Audit fold-back (2026-07-15, 리뷰어 GO-WITH-FIXES 3건 반영)

1. **TS/JS 이중 산출물**: lib/*.js, bin/**/*.js 는 `npm run build:server` +
   `npm run build:cli`(tsconfig.build/bin)로 재생성되는 커밋된 컴파일 산출물.
   lib/bin TS를 바꾸는 모든 구현 WP는 두 빌드를 돌려 JS를 재생성·커밋해야 하며,
   각 구현 문서(040/050)의 검증 절차에 이를 명시한다.
2. **050 테스트 영향 전수 목록**: 리뷰어가 확인한 기본값 단언 테스트를 050 문서에
   그대로 수록 — config.test.js:79, image-model.test.ts:8-9,
   gpt56-rollout-contract.test.ts:42-44, card-news-contract.test.ts:60-61,168,204
   (card-news 전용 모델은 유지 여부를 050에서 결정), videoRoute/videoExtendedRoute/
   grokVideoAdapter/cli-video-command-contract/cli-capabilities-contract 계열,
   api-provider-parity/grok-planner-adapter/prompt-fidelity 계열.
3. **040→050 경계 계약**: 040은 CLI 표면(도움말/플래그/별칭/exit code)만 소유하고
   기본값 값 자체는 건드리지 않는다. 050은 config.ts + provider adapter fallback +
   재생성 JS + 테스트 기대값만 소유한다. defaults 커맨드의 표면 문구는 040,
   defaults가 기록하는 값의 기본은 050 소관.

표기 정정: 배경 허브 문서는 `000_analysis_roadmap.md`.
