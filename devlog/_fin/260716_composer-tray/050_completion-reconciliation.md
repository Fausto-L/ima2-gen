# 050 — 완료 상태 재조정 (product diff 0)

## 배경

wp0–wp4와 c0–c4가 모두 완료되고 `cxc loop validate`가 OK인 뒤 세션이 다시 P로 진입했다. hook은 상태를 안내할 뿐 FSM 전환 주체가 아니므로 재진입 원인을 hook으로 단정하지 않는다. 제품 구현은 이미 완료됐고, 이 사이클은 상태 정합성만 재검증한다.

B 검증 도중 이 사이클이 수정하지 않은 `PromptComposer`, element mention, i18n 파일에 병행 쓰기가 관찰되어 최초 A fingerprint는 더 이상 정적 기준으로 사용할 수 없었다. 해당 변경은 보존하며, 병행 쓰기 이후 재채취한 안정 기준과 C fingerprint를 비교해 이 정합성 사이클 자체의 product-path 무변경을 증명한다.

## 범위

- IN: goalplan remaining/unmet 0 확인, 커밋 `91068e3`·`53be0c3` 존재 확인, wp4 계약 테스트와 loop validate 재실행, ledger에 재조정 증거 기록, D→IDLE 종료.
- OUT: source/UI/API 변경, 새 기능, provider 호출, 과금 생성, 병행 dirty-tree 수정.

## Diff-level 계획

- MODIFY `.codexclaw/goalplans/mockup-a-d-d1-d2-d3-devlog-plan-260716-composer/goalplan.json`: 임시 wp5/c5를 등록하고 commit/test/source-fingerprint 증거로 done/met 처리한다. loop validate와 FSM IDLE은 그 다음 C/D 순서에서 확인한다.
- APPEND `.codexclaw/goalplans/mockup-a-d-d1-d2-d3-devlog-plan-260716-composer/ledger.jsonl`: wp5 start/done, c5 met.
- NO SOURCE DIFF: `ui/`, `lib/`, `routes/`, `tests/`는 변경하지 않는다.

## 수용 기준

1. `git log -2 --oneline`에 `53be0c3`, `91068e3`가 존재한다.
2. wp4 targeted contracts가 18/18 통과한다.
3. `git status --porcelain=v1 -- ui/src lib routes tests | shasum -a 256`로 product-source fingerprint를 산출한다. 최초 A/B 불일치는 병행 변경 시각/파일로 기록하고, 병행 쓰기 이후 5초 간격으로 채취한 두 기준 sample이 같아야 한다. C에서도 같은 명령을 5초 간격으로 두 번 실행해 두 기준 sample과 모두 같음을 확인한다. 생성물인 `ui/dist`는 source fingerprint에서 제외한다.
4. c5를 met 처리한 뒤 `cxc loop validate --slug ...`가 OK이고 FSM은 D→IDLE로 닫힌다. 이 둘은 c5 선행조건이 아니라 C/D 후속 증거다.

## Terminal

- 예상 결과: `DONE` — 상태 재조정 완료, 이 사이클에 귀속되는 product source diff는 0이며 병행 변경은 그대로 보존한다.
- 실패 시: 증거 불일치가 있으면 DONE을 주장하지 않고 B에서 해당 정합성만 수정한다.
