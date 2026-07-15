# 040 — Snapshot lifecycle: 획득·sanitize·tag·번들·drift

> **Post-interview canonical (2026-07-16).** WP4. 인터뷰 Round 3/5(full-schema 번들 + tag + takedown 게이트)의 구현 phase다. 030 runtime이 가져온 live `tools/list`를 020 catalog가 소비 가능한 snapshot으로 만드는 전 과정을 소유한다.

## 목적

provider tool 계약의 생애주기를 하나의 파이프라인으로 만든다: live 획득 → 비밀 제거(sanitize) → provenance/entitlement tag → 로컬 캐시 저장 → npm 번들 대상 선별 → drift 감지·잠금.

## Lifecycle 규칙

1. **획득** — 030 connectionManager의 인증 세션에서 paginated `tools/list` 전체를 받고 original hash를 계산한다.
2. **Sanitize** — 두 단계 분리(인터뷰 rescan 설계): (a) secret/account 제거 — token, email, account id, signed URL, output 예시; (b) trust 라벨링 — description은 `trust: "upstream-untrusted"`로 표시하고 어떤 소비자도 instruction context에 병합하지 않는다.
3. **Tag** — `SnapshotProvenance { provider, endpoint, fetchedAt, protocolVersion, entitlementTag, originalHash, sanitizedHash }`. 같은 provider라도 remote endpoint와 local package는 별도 source identity다.
4. **로컬 캐시** — `${IMA2_CONFIG_DIR}/mcp/snapshots/<provider>.json` (0600). live 갱신이 항상 번들본을 덮는다.
5. **번들** — `assets/mcp-snapshots/<provider>.sanitized.json`을 npm `files`에 포함. 번들본은 catalog에서 영구히 `documented` 층이다. **배포 게이트**: 릴리스 체크리스트에 provider별 약관 재확인 기록과 이의 접수 시 즉시 제거(takedown) 정책 명시 — Runway/Higgsfield ToS 문구는 수용된 잔여 리스크(005 Round 5).
6. **Drift** — live sanitizedHash ≠ 저장 hash면 해당 provider tool을 `stale`로 전이하고 실행을 잠근다. 재연결/재획득만이 잠금을 푼다. entitlement 차이(계정별 tool 부재)는 drift가 아니라 `blocked(cause: entitlement)`로 구분한다.

## File change map

| Op | Path | 변경 |
|---|---|---|
| NEW | `lib/mcp/snapshotPipeline.ts` | 획득→sanitize→tag→저장 orchestration. 030의 raw tools/list를 입력으로 받는 순수 계층. |
| NEW | `lib/mcp/sanitizer.ts` | secret 제거 규칙표 + trust 라벨. 규칙은 데이터 기반(패턴 배열)으로 유지. |
| NEW | `lib/mcp/snapshotStore.ts` | 로컬 캐시 read/write/invalidate (0600 atomic), 번들본 fallback 로드. |
| NEW | `assets/mcp-snapshots/README.md` | 번들 스냅샷의 출처·라이선스 입장·takedown 연락 절차. |
| NEW | `assets/mcp-snapshots/*.sanitized.json` | 010 spike 산출 fixture에서 승격된 배포본. |
| MODIFY | `package.json` | `files`에 `assets/mcp-snapshots` 추가. |
| MODIFY | `lib/contracts/catalog.ts` | snapshotStore 로더 연결 (020에서 마련한 hook 사용). |
| NEW | `tests/mcp-sanitizer.test.ts` | secret 패턴 제거 진리표, trust 라벨 보존, 원문 hash 불변. |
| NEW | `tests/mcp-snapshot-pipeline.test.ts` | 획득→저장 왕복, drift 전이, entitlement vs drift 구분, 번들 fallback. |

## Conditional activation scenarios

- Drift 잠금: fixture hash를 변조하면 해당 provider 생성 capability가 실행 전에 잠긴다.
- Entitlement 구분: live 목록에서 tool 하나가 빠졌을 때(hash 자체는 유효) drift가 아니라 해당 tool만 `blocked(entitlement)`가 된다.
- Secret 잔존 0: 실제 spike 산출물에 대해 sanitizer scan이 bearer/refresh/email/signed-URL 패턴 0건을 보고한다.
- 번들 fallback: 로컬 캐시가 없는 clean install에서 번들본이 `documented`로 로드되고 callable 조회는 빈 결과다.

## Acceptance criteria

- 모든 배포 snapshot에 provenance/entitlement tag와 sanitizedHash가 있다.
- 번들 snapshot이 어떤 코드 경로로도 실행 권한 증거로 쓰이지 않는다.
- 릴리스 문서에 약관 재확인 기록 절차와 takedown 정책이 존재한다.
- drift·entitlement·revocation이 서로 다른 typed 상태로 관찰된다.

## Verification

```bash
npm run typecheck
npm run typecheck:tests
node --test --import tsx tests/mcp-sanitizer.test.ts tests/mcp-snapshot-pipeline.test.ts
npm run test:inventory
```
