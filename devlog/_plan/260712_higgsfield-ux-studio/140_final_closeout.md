---
created: 2026-07-18
tags: [ima2-gen, phase, closeout, verification, ledger, archive]
---

# Phase 140 — Final gates + 원장 정합 + lane 종료 판정

Phase 140은 구현 phase가 아니라 이 레인의 최종 감사·문서 정합·이동 판정이다.
010~080과 후속 100~130의 실제 코드, 테스트, QA artifact를 다시 읽어
`090_closeout.md`를 현재 상태로 재작성한다. 과거 green 수치나 WIP 커밋만으로
done을 선언하지 않는다.

## 진입 조건

1. 010~080의 canonical phase 문서와 `090_closeout.md`,
   `095_current_status.md`를 읽는다.
2. `100_*.md`, `110_*.md`, `120_*.md`, `130_qa_perf_060.md`를 실제 파일명으로
   열고 각각의 done criteria와 증거 경로를 수집한다. 현재 checkout에 없는 phase
   번호나 증거는 추정해 만들지 않고 `BLOCKED — phase artifact missing`으로 둔다.
3. 130의 생성 예산, provider blocker, 성능 FAIL은 완료 보고에서 숨기지 않는다.
   실행 완료(`DONE`)와 수용 성공(`PASS`)을 분리한다.
4. `ui/src/components/agent/*` 불가침과 다른 active lane 소유 파일 충돌 여부를
   확인한다 (`090_closeout.md:8-15`).

## 1. 전체 검증 게이트

같은 checkout, 같은 dependency tree에서 아래 순서로 fresh 실행한다.

```bash
npm run typecheck
npm run typecheck:tests
npm run test:inventory
npm test
cd ui && npm run build
```

각 명령의 시작·종료 시각, exit code, pass/fail count, 로그 경로를
`assets/140/full-gates.md`에 기록한다. 한 명령이 실패해도 나머지 read-only gate를
가능한 범위에서 계속 실행해 전체 실패 지도를 남긴다. dependency/environment
failure는 product regression과 분리한다.

| gate | PASS 기준 | terminal 실패 기록 |
|---|---|---|
| `npm run typecheck` | exit 0 | 첫 diagnostic + 전체 log |
| `npm run typecheck:tests` | exit 0 | 첫 diagnostic + 전체 log |
| `npm run test:inventory` | exit 0, 누락 0 | 누락/중복 test 목록 |
| `npm test` | exit 0, fail 0 | pass/fail/skip 총계 + failing tests |
| `cd ui && npm run build` | exit 0 | tsc/vite 단계와 첫 error |

과거 `095_current_status.md:26-30`의 1665/1665나 이전 rollout의 1286/1286은 참고
이력일 뿐 final gate가 아니다. Phase 140에서 새로 얻은 수치만 최종값으로 쓴다.

## 2. Phase 원장 재작성

`090_closeout.md`의 “Phase 진행 원장”을 010~140의 실제 상태로 교체한다.
기존 010~080 행도 보존 복사하지 말고 현재 증거를 다시 대조한다.

### 원장 row 규약

```md
| Phase | terminal | verdict | 실제 상태 | 구현/QA 증거 | commit/PR | 미해결 |
```

- `terminal`: `DONE | BLOCKED | NEEDS_HUMAN`.
- `verdict`: `PASS | FAIL | NOT_RUN`.
- 실제 상태는 `done`, `partial`, `wip`, `deferred` 중 하나만 쓴다.
- commit hash만으로 done을 증명하지 않는다. phase criterion별 artifact/test를
  함께 연결한다.
- 100~130은 번호만 보고 내용을 추정하지 않는다. 해당 phase 문서의 title,
  criteria, closeout 결과를 그대로 요약한다.
- 130의 A/B/C/D는 하나의 행에 뭉개지 말고 증거 칸에서 각각 terminal/verdict를
  표시한다.
- 140 행은 full gates, 원장 정합, 미결정 원장 이동, lane 이동 판정이 모두 끝난
  뒤 마지막으로 추가한다.

### stale 서술 교정

최소한 다음은 현재 코드/증거와 맞춰 다시 쓴다.

- 060의 `presetIds`→image XMP 전파는 현재 배선돼 있으므로 “미구현”으로 남기지
  않는다. 실생성/metadata evidence의 PASS/BLOCKED만 잔여로 적는다.
- 070의 product test sheet와 dropped-ref warning은 구현 완료로 과장하지 않는다.
- 080은 performance gate actuals와 virtualization 결정을 분리한다. profile FAIL은
  곧바로 구현 실패를 숨기는 근거가 아니라 후속 결정의 입력이다.
- Gemini image `gemini-api`와 Gemini video 지원 여부를 구분한다. provider 이름이
  같다는 이유로 video DONE을 추정하지 않는다.
- Runway MCP smoke는 credit cost가 응답에 없으면 `UNVERIFIED`로 유지한다.

## 3. 미결정 원장 정리

`090_closeout.md:36-61`의 각 항목을 아래 셋 중 하나로 종결한다.

1. **resolved**: 실제 구현/폐기 결정과 날짜·근거가 있다. “해소된 항목”으로 이동.
2. **future**: 이 lane의 done criteria가 아니며 후속 가치가 있다. 기존 또는 새
   `_plan/_future/<dated-slug>/` 문서에 owner, trigger, dependency, evidence를 남긴다.
3. **blocks lane**: 010~130의 명시적 done criterion에 속한다. 해결 전에는 lane을
   `_fin`으로 이동하지 않는다.

현재 원장의 리니지 뷰, Generate 비용 병기, 홈 기본 진입, ffmpeg concat,
비디오 compare, MCP server, 립싱크/TTS를 각각 판정한다. 050에서 이미 결정된
Assets 저장 형식처럼 resolved evidence가 있는 항목은 미결정 표에 중복 유지하지
않는다. 단순히 “나중에”라고 쓰지 말고 future 문서 경로를 남긴다.

## 4. `_fin` 이동 결정 체크리스트

`090_closeout.md:58-61`의 기존 기준을 다음처럼 엄격히 평가한다.

- [ ] 010~080이 모두 `done + DONE/PASS`다.
- [ ] 새 100~130 phase가 모두 자체 criteria를 닫았다.
- [ ] 130 A~D의 FAIL/BLOCKED가 lane 필수 기준인지, 후속 최적화인지 판정됐다.
- [ ] 다섯 full gate가 같은 checkout에서 모두 green이다.
- [ ] phase별 필수 screenshot/JSON/sidecar/수동 QA artifact가 실제로 존재한다.
- [ ] `090_closeout.md` 원장과 현재 코드/phase 문서가 일치한다.
- [ ] 미결정 항목이 resolved 또는 `_plan/_future/`로 1:1 정리됐다.
- [ ] 다른 active lane 소유 변경과 미커밋/미통합 phase가 없다.
- [ ] phase별 commit sequence와 evidence가 추적 가능하다.

### 이동 판정

- 전부 충족: `DONE/PASS`로 판정하고 lane 전체를
  `devlog/_fin/260712_higgsfield-ux-studio/`로 이동한다. active-lane README와
  roadmap 참조도 archive 위치에 맞춘다.
- 필수 criterion, full gate, missing phase artifact 중 하나라도 미충족:
  `BLOCKED/FAIL`로 active에 유지한다. 실패를 `_future`로 옮겨 lane을 억지로
  닫지 않는다.
- 기능은 닫혔으나 virtualization 같은 선택적 개선만 남음: 해당 항목을
  `_plan/_future/`로 분리하고, 원 criterion이 실제로 PASS인지 확인한 뒤에만
  lane을 이동한다.
- 제품/비용/UX 결정을 사람만 할 수 있음: 해당 항목은 `NEEDS_HUMAN`; 그 항목이
  명시적 done criterion이면 lane도 `NEEDS_HUMAN`으로 active 유지한다.

## 5. Commit sequence 기대값

최종 history는 phase 경계를 보존해야 한다. 여러 phase를 한 closeout commit으로
압축하지 않는다.

1. Phase 100 구현/테스트/증거 commit(s).
2. Phase 110 구현/테스트/증거 commit(s).
3. Phase 120 구현/테스트/증거 commit(s).
4. Phase 130 QA/perf/060 evidence commit. 생성 원본이 저장소 정책상 commit 대상이
   아니면 manifest와 sanitized 결과만 commit하고 실제 저장 위치를 기록한다.
5. Phase 140 full-gate logs + `090_closeout.md` 원장/미결정 정합 commit.
6. `_fin` 이동과 active roadmap 갱신은 마지막 archive commit으로 분리한다.

기존 010~080 commit을 rewrite/squash하지 않는다. phase commit이 없거나 서로 다른
상태가 한 commit에 섞였으면 final report에 그대로 적고 새 증거 commit으로
보완한다. Phase 140 실행자는 임의 push/publish/release를 하지 않는다.

## 6. 최종 보고 형식

```md
# Higgsfield UX Studio final closeout

## Terminal outcomes
| item | terminal | verdict | actual | evidence | blocker/next |
|---|---|---|---|---|---|
| 010 | DONE/BLOCKED/NEEDS_HUMAN | PASS/FAIL/NOT_RUN | ... | ... | ... |
| ... | ... | ... | ... | ... | ... |
| 130-A element QA | ... | ... | ... | ... | ... |
| 130-B Runway MCP | ... | ... | ... | ... | ... |
| 130-C node perf | ... | ... | ... | ... | ... |
| 130-D preset closeout | ... | ... | ... | ... | ... |
| full gates | ... | ... | ... | ... | ... |
| undecided ledger | ... | ... | ... | ... | ... |
| lane archive | ... | ... | ... | ... | ... |

## Fresh gate totals
- typecheck: <exit>
- typecheck:tests: <exit>
- test:inventory: <exit, inventory count>
- npm test: <pass/fail/skip>
- ui build: <exit>

## Lane decision
- outcome: DONE | BLOCKED | NEEDS_HUMAN
- location: <_fin path or active path>
- required next action: <none or exact blocker owner/action>
```

각 item은 세 terminal 중 하나를 반드시 가진다. “대체로 완료”, “거의 green”,
“추후 확인” 같은 중간 표현은 terminal outcome을 대신할 수 없다.

## Phase 140 완료 기준

- fresh full gates 5종의 원문 로그와 총계가 있다.
- `090_closeout.md`가 010~140의 실제 상태와 terminal/verdict를 반영한다.
- 미결정 원장의 모든 행이 resolved/future/blocks lane 중 하나로 이동했다.
- phase별 commit sequence가 보존되거나 예외가 명시됐다.
- `_fin` 이동 여부가 체크리스트로 결정됐고 final report의 모든 item이
  `DONE`, `BLOCKED`, `NEEDS_HUMAN` 중 하나로 끝난다.

