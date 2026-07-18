---
created: 2026-07-12
tags: [ima2-gen, phase, closeout, undecided]
---

# Phase 090 — Closeout + 미결정 원장

## 공통 검증 게이트 (매 phase)

1. `npm run typecheck` / `typecheck:tests` / `npm test` / `test:inventory`
   전부 green + `cd ui && npm run build`.
2. 다크/라이트 × 데스크톱/모바일 스크린샷 → 레인 `assets/<phase>/`.
3. 파일 500줄/함수 50줄 컨벤션.
4. `260711_production-hardening` 레인과 충돌 확인 — `ui/src/components/
   agent/*`는 이 레인에서 불가침.

## Phase 진행 원장

| Phase | 상태 | 증거(커밋/PR) |
|---|---|---|
| 010 | **done** (2026-07-12) | `assets/010/` 4면 스크린샷, `.codexclaw/evidence/260712-phase-010-theme-removal.md`, 1133 테스트 green |
| 020 | **done** (2026-07-12) | 커밋 6d2e236, assets/020/, evidence/260712-phase-020-worker.md |
| 025 | **done** (2026-07-12) | assets/025/, evidence/260712-phase-025-worker.md, 1133 테스트 green |
| 026 | **done** (2026-07-12) | assets/026/, WCAG 매트릭스, 1133 테스트 green |
| 030 | **done** (2026-07-12) | assets/030/, evidence/260712-phase-030-test-worker.md, sol 11항목 감사, 1133 테스트 green |
| 040 | **done** (2026-07-13) | resultChaining.ts, GalleryImageTile overlay, IntersectionObserver virtualization, sol 8항목 감사 |
| 050 | **done** (2026-07-13) | `050_assets-library.md:169` 상태 done, SQLite 스파이크 결정 |
| 060 | **done** (2026-07-19) | Grok orbit 영상 실오빗(`assets/060/grok-orbit-frames.png`) + sidecar `presetIds:["orbit-left"]` + 실제 이미지 XMP `source:xmp` 확인(1784402537385, `assets/060/`). Gemini video BLOCKED(no direct route, `routes/video.ts:184`), Gemini image BLOCKED(429) — `_future` 후보로 분리 |
| 070 | **done** (2026-07-19) | `tests/element-mention-ui-contract.test.js` 14/14 (110, Euler round-3 PASS). 3-provider 실생성 QA(`assets/070/`)에서 defect 3건 발견 → 전부 수정(`374c257` refs 경로, `7816af4` gemini enum + grok toggle) + live 검증(oauth refsCount 2, gemini wire 4/4, grok toggle parity). Gemini live 재실행은 429/예산으로 `_future` |
| 080 | **done** (2026-07-19) | 100: last-frame→I2V orchestration 구현(202+SSE, videoLineage, Einstein round-4 PASS, 커밋 7건). 120: node-studio 통합(Socrates round-4 PASS, 커밋 9건) + `tests/node-studio-ui-contract.test.js` 19/19. 130: perf 전 gate PASS(`assets/080/node-profile.json` — render p95 45.6ms, 120FPS, long frame 0, instantiate 18.1ms, fit-view 9/9) |

> 2026-07-18 closeout-sweep 감사(`devlog/_plan/260718_closeout-sweep/000_audit.md`
> 매트릭스 #6)에서 070/080 미커밋 구현을 WIP 체크포인트로 전달. 레인은
> 위 잔여 항목으로 active 유지.

## 미결정 원장

결정 전에는 어떤 phase에도 넣지 않는다. 결정되면 phase에 편입하고 여기에
결정 근거를 남긴다.

| 항목 | 관련 스펙 | 메모 |
|---|---|---|
| 리니지 **뷰**(계보 탭/필터) | 008 | 기록 필드(`parentId`/`presetIds`/`elementIds`)는 040~070에서 선반영. 뷰를 만들지, 언제 만들지 미정. |
| Generate 버튼 비용 병기 | 008 | 020 컨트롤 킷에 얹을 수도, 별도 후속일 수도. |
| 홈을 기본 진입 모드로 | 003/060 | 060 완료 후 실사용으로 판단. |
| Assets 저장 형식 (JSON vs SQLite) | 004/050 | 050 착수 시 스파이크 1회로 결정. |
| ffmpeg concat 내보내기 | 007 | 서버 의존성 추가 여부. |
| 비디오 동기 컴페어 뷰 | 007 | 수요 확인 후. |
| MCP 서버(`ima2 mcp`) | 000 서치 근거 | 레인 밖 후보. 결정 시 `_plan/_future/`로. |
| 립싱크/TTS | 007 | 프로바이더 네이티브 지원 시 재검토. `_future/` 후보. |

### 해소된 항목

| 항목 | 결정 | 일자 |
|---|---|---|
| 라이트 테마 유지 범위 | **다크 단일** — 라이트 테마·ThemeToggle 제거, 010에 편입 | 2026-07-12 (사용자 결정) |

## _fin 이동 기준 — **2026-07-19 충족**

- 010~080 전부 done + 100~130 done + 게이트 6종 중 5종 green(`typecheck:tests`는
  병행 세션의 미커밋 `lib/mcp/downloadMediaResult.ts:115` 타입 오류 1건으로
  외부 차단; lane 소유 테스트 파일은 전부 green) → 레인 전체 `_fin` 이동.
- 미결정 원장 + 신규 후속은 `_plan/_future/260719_higgsfield-open-ledger.md`로
  분리 기록 후 이동.
