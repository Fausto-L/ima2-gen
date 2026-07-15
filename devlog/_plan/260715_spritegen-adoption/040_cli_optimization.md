# 040 — CLI 최적화 diff-level PRD

상태: diff-level 설계 (WP3 구현 사이클에서 소비)

## 1. 목적과 경계

`ima2`의 반복 사용 흐름을 짧게 만들고, 도움말이 실제 작업을 실행하거나 실제 플래그와
어긋나는 문제를 고친다. 이 문서는 **CLI 표면만** 소유한다. 모델/품질/크기/reasoning 등
제품 기본값의 **값 변경은 050 소관**이며 040에서 수정하지 않는다.

구현은 TS 소스만 수정한다. 완료 후 반드시 `npm run build:cli`를 실행해 `bin/**/*.js`를
재생성한다. 생성된 JS는 빌드 산출물이므로 수동 편집하지 않는다.

### 구현 범위

1. `backfill-thumbs --help`, `doctor --help` 안전성
2. 실제 동작과 help의 모델/플래그 정합성
3. 이미지 모델 별칭 공통 canonicalizer
4. `-o`, `-n/--count`, video frame output 명칭 정렬
5. 최신 history 이미지 참조 `@last`
6. thumbnail backfill 실패 exit code

### 비범위

- prompt-only 기본 서브커맨드
- `config`/`defaults`, `ps`/`inflight` 통합
- 선언형 command registry 전환
- `--json` 오류 envelope 통일
- 기본 모델·quality·size·timeout 값 변경

## 2. 변경 파일 매니페스트

| 상태 | 경로 | 책임 |
|---|---|---|
| NEW | `bin/lib/model-aliases.ts` | 이미지 모델 별칭을 정식 ID로 변환 |
| MODIFY | `bin/lib/client.ts` | 최신 history 항목을 조회하는 `@last` resolver |
| MODIFY | `bin/ima2.ts` | backfill help dispatch, backfill 결과 exit 처리 |
| MODIFY | `bin/commands/backfillThumbs.ts` | help/결과 계약과 실패 exit code |
| MODIFY | `bin/commands/doctor.ts` | top-level doctor usage와 `--help` short-circuit |
| MODIFY | `bin/commands/gen.ts` | model alias 적용, help 모델 목록 정정 |
| MODIFY | `bin/commands/edit.ts` | model alias, `@last`, help 정정 |
| MODIFY | `bin/commands/multimode.ts` | model alias, count 별칭, help 정정 |
| MODIFY | `bin/commands/node.ts` | node generate model alias 적용 |
| MODIFY | `bin/commands/show.ts` | `@last` 및 `--server` help |
| MODIFY | `bin/commands/metadata.ts` | `@last` 및 `--server` help |
| MODIFY | `bin/commands/video.ts` | `--ref @last`, frame output 명칭 정렬 |
| MODIFY | `bin/commands/ls.ts` | `--server` help |
| MODIFY | `bin/commands/ps.ts` | `--server` help |
| MODIFY | `bin/commands/cancel.ts` | `--server` help |
| MODIFY | `bin/commands/ping.ts` | `--server` help |
| MODIFY | `tests/cli-commands.test.js` | help, alias, `@last`, count 계약 |
| MODIFY | `tests/cli-video-command-contract.test.js` | frame output와 `--ref @last` 계약 |
| MODIFY | `tests/cli-feature-parity-contract.test.js` | 공통 model alias 적용 및 literal 보존 계약 |
| MODIFY | `tests/cli-doctor-status-contract.test.js` | doctor help 무부작용 계약 |
| NEW | `tests/cli-help-safety-contract.test.js` | backfill help/실패 exit 회귀 계약 |

## 3. WP3-1 — help 안전성과 backfill 종료 계약

### 3.1 `backfill-thumbs --help`

현재 `bin/ima2.ts`는 argv를 버리고 `backfillThumbs()`를 바로 호출하며
(`bin/ima2.ts:467-470`), 함수는 즉시 디렉터리를 스캔한다
(`bin/commands/backfillThumbs.ts:5-18`).

변경 스케치:

```ts
// before
export async function backfillThumbs(): Promise<void>

// after
export interface BackfillThumbsResult { created: number; skipped: number; failed: number; total: number }
export async function backfillThumbs(argv: string[] = []): Promise<BackfillThumbsResult | null>
```

- `-h|--help`면 usage만 stdout에 출력하고 `null` 반환한다. 스캔, index invalidation,
  thumbnail 생성은 호출하지 않는다.
- `bin/ima2.ts`는 `args.slice(1)`를 전달한다.
- 정상 실행에서 `failed > 0`이면 요약 출력 후 exit 1, top-level throw/백필 자체 예외도
  exit 1이다. 전부 성공하면 exit 0이다.
- 부분 성공도 실패 파일이 있으므로 exit 1로 취급하되 생성된 thumbnail은 롤백하지 않는다.

활성화 시나리오:

```text
ima2 backfill-thumbs --help
→ usage 출력, thumbnail 생성 로그 없음, filesystem 불변, exit 0

ima2 backfill-thumbs
→ failed=0: exit 0 / failed>0 또는 예외: exit 1
```

테스트: `tests/cli-help-safety-contract.test.js`에서 임시 `IMA2_GENERATED_DIR`와 fixture를
사용해 help 전후 파일 목록/mtime 불변 및 exit 0을 확인한다. 실패 가능한 media fixture 또는
backfill helper mock 경계를 사용해 exit 1을 확인한다. 사용자 gallery는 절대 참조하지 않는다.

### 3.2 `doctor --help`

`bin/commands/doctor.ts`에 `showDoctorHelp()`를 추가하고 `doctor(argv)` 첫 분기에서
`-h|--help`를 검사한다. `image-probe --help`의 기존 상세 help는 유지한다.

```text
ima2 doctor --help
→ doctor / doctor image-probe usage만 출력, dependency/storage/auth probe 미실행, exit 0
```

테스트: `tests/cli-doctor-status-contract.test.js`에 stdout이 `Usage: ima2 doctor`를 포함하고
`passed`, `Storage`, 실제 config 경로 진단을 포함하지 않는 runtime case를 추가한다.

## 4. WP3-2 — help 정확성

문구만 고치며 기본값은 바꾸지 않는다.

| 파일 | after |
|---|---|
| `bin/commands/gen.ts` | `--model` 목록에 `gpt-5.3-codex-spark` 추가 |
| `bin/commands/edit.ts` | spark 추가, `--timeout <sec> Default: 180`, `--server <url>` 추가 |
| `bin/commands/multimode.ts` | `--server <url>` 추가 |
| `bin/commands/ls.ts` | usage에 `[--server <url>]` 추가 |
| `bin/commands/show.ts` | usage에 `[--server <url>]` 추가 |
| `bin/commands/ps.ts` | usage에 `[--server <url>]` 추가 |
| `bin/commands/cancel.ts` | usage에 `[--server <url>]` 추가 |
| `bin/commands/ping.ts` | usage에 `[--server <url>]` 추가 |
| `bin/commands/metadata.ts` | `@last` 설명과 `[--server <url>]` 추가 |

테스트: `tests/cli-commands.test.js`의 각 `--help` case에서 새 문자열을 검증한다. 기존
provider/model literal assertions는 제거하지 않는다.

## 5. WP3-3 — 이미지 모델 별칭 canonicalizer

`bin/lib/model-aliases.ts`를 단일 owner로 신설한다.

```ts
export const IMAGE_MODEL_ALIASES = {
  luna: "gpt-5.6-luna",
  sol: "gpt-5.6-sol",
  terra: "gpt-5.6-terra",
  spark: "gpt-5.3-codex-spark",
} as const;

export function canonicalizeImageModel(value: unknown): string | undefined;
```

- `undefined/null/""`은 `undefined`, 정식 ID와 미등록 값은 문자열 그대로 반환한다.
- `gen`, `edit`, `multimode`, `node generate`에서 **validation 전** canonicalize하고,
  request body에는 정식 ID만 보낸다.
- 대소문자 자동 보정은 하지 않는다. `Luna`는 기존처럼 invalid다.
- help에 `Aliases: luna, sol, terra, spark` 한 줄을 추가한다.

`tests/cli-feature-parity-contract.test.js`는 현재 TS source의 provider flag/error/body 전달
문자열을 regex로 고정한다. 구현 시 기존 `provider: { type: "string" }`, provider enum help,
provider validation error, `if (args.provider) body.provider = args.provider` literal을 그대로
보존한다. 모델은 `const model = canonicalizeImageModel(args.model)`을 추가하되 기존 정식 모델
목록 literal도 유지한다. 테스트에는 네 alias가 canonical ID로 request body에 도달하는
runtime cases를 추가하며, 기존 literal regex를 helper 구현 regex로 대체하지 않는다.

활성화 시나리오:

```text
ima2 gen "sprite" --model luna       → body.model = "gpt-5.6-luna"
ima2 edit @last -p "idle" --model spark → body.model = "gpt-5.3-codex-spark"
ima2 multimode "sheet" --model terra → canonical model로 전송
ima2 node generate "walk" --model sol → canonical model로 전송
```

## 6. WP3-4 — 플래그 정렬

### 6.1 session graph output

`bin/commands/session.ts`의 공통 `out` flag에 `short: "o"`를 추가하고 help를
`[-o, --out <file>]`로 정정한다. 기존 `--out`은 그대로 유지한다.

### 6.2 multimode count

`bin/commands/multimode.ts`에 `count: { short: "n", type: "string" }`을 추가한다.
동시에 `--max-images`와 `-n/--count`가 주어지면 모호성을 숨기지 않고 exit 2로 실패한다.
하나만 있으면 해당 값을, 둘 다 없으면 기존 기본값 4를 사용한다. 범위 clamp 동작은
기존과 동일하게 유지한다.

```text
ima2 multimode "sprite" -n 6      → maxImages=6
ima2 multimode "sprite" --count 6 → maxImages=6
ima2 multimode "sprite" -n 6 --max-images 4 → 설명 오류 + exit 2
```

### 6.3 video frame output

`bin/commands/video.ts` frame spec을 다른 video 명령과 같은 canonical key로 통일한다.

```ts
// before: output has short "o", out is alias
// after
out: { short: "o", type: "string" },
output: { type: "string" }, // backward-compatible alias
```

내부 target은 `args.out ?? args.output` 순서로 선택한다. help는
`-o, --out <path>`를 주 표기로, `--output <path> Alias for --out`으로 표시한다.
기존 `--output`은 제거하지 않는다.

테스트: `tests/cli-commands.test.js`에 session/multimode cases,
`tests/cli-video-command-contract.test.js`에 `-o`, `--out`, `--output`이 같은 request/output
계약을 만드는 case와 multimode 충돌 exit 2 case를 추가한다.

## 7. WP3-5 — `@last` resolver

`bin/lib/client.ts`에 history 최신 항목 resolver를 추가한다.

```ts
export interface CliHistoryItem { filename: string; url?: string; createdAt?: string; [key: string]: unknown }
export async function resolveLastHistoryItem(base: string): Promise<CliHistoryItem>;
export async function resolveHistoryReference(base: string, value: string): Promise<string>;
```

- `resolveLastHistoryItem`은 `GET /api/history?limit=1`을 호출하고 `items ?? history`의 첫
  항목을 반환한다. 항목 또는 filename이 없으면 code `HISTORY_EMPTY`인 오류를 던진다.
- `resolveHistoryReference`는 값이 정확히 `@last`일 때만 최신 filename을 반환하며 다른
  값은 그대로 반환한다. suffix/부분 일치는 하지 않는다.
- 호출 명령은 먼저 `resolveServer()`한 뒤 resolver를 호출한다.
- 로컬 파일이 필요한 `edit`, `metadata`, `video --ref`는 반환 filename을
  `config.storage.generatedDir`와 결합한다. `show`는 반환 item을 그대로 표시해 history를
  두 번 조회하지 않는다.
- `video --ref`의 repeatable refs 각각에 적용한다. `@last`가 여러 번 등장해도 한 command
  실행에서는 history를 한 번만 조회하도록 latest promise/item을 재사용한다.
- `@last`는 최신 **history 이미지**만 뜻한다. 최신 video, session, node는 범위 밖이다.
- 실제 파일명이 `@last`인 경우 `./@last`로 명시하면 literal 파일로 취급한다.
- `HISTORY_EMPTY`는 사용자 입력/상태 오류로 exit 5에 매핑하고 메시지는
  `no history image available for @last`로 통일한다.

활성화 시나리오:

```text
ima2 show @last
→ 최신 history item 출력

ima2 edit @last -p "make the idle pose clearer"
ima2 metadata @last --json
ima2 video "animate a walk cycle" --ref @last
→ 최신 history filename을 generatedDir의 로컬 이미지로 해석

빈 history에서 위 명령
→ "no history image available for @last", exit 5, 생성 API 미호출
```

테스트: `tests/cli-commands.test.js`의 mock server에 `/api/history?limit=1` fixture를 추가해
show/edit/metadata가 최신 filename을 쓰는지 검증한다. video는
`tests/cli-video-command-contract.test.js`에서 `--ref @last`가 resolved data URI로 요청되고
history가 비었을 때 video endpoint가 호출되지 않는지 검증한다.

## 8. 호환성 및 계약 영향

- 모두 additive 또는 잘못된 help/exit 수정이다. 기존 정식 model ID, `--max-images`,
  `--out`, video frame `--output`은 유지한다.
- 의도된 관찰 가능 변경: backfill 일부 실패가 exit 0이던 동작은 exit 1이 된다.
- `@last`는 exact token만 예약하므로 literal 파일은 `./@last`로 접근 가능하다.
- `cli-feature-parity-contract`의 소스 literal regex는 유지한다. 공통 helper 도입을 이유로
  provider/model 목록과 body mapping을 간접화하지 않는다.
- 빌드 후 생성되는 `bin/**/*.js` diff는 구현 PR에 포함하되 TS가 SSoT다.

## 9. 구현 순서와 검증 게이트

1. help 안전성 + backfill exit code와 회귀 테스트
2. help 정확성
3. model alias helper 및 네 consumer
4. 플래그 alias 정렬
5. `@last` resolver 및 consumer
6. CLI 빌드 산출물 재생성 후 전체 관련 계약 검증

필수 명령:

```bash
npm run build:cli
node --test tests/cli-help-safety-contract.test.js
node --test tests/cli-doctor-status-contract.test.js
node --test tests/cli-feature-parity-contract.test.js
node --test tests/cli-video-command-contract.test.js
node --test tests/cli-commands.test.js
npm run typecheck
npm run typecheck:tests
npm run test:inventory
```

수동 smoke는 생성 명령을 실행하지 않고 help만 확인한다.

```bash
node bin/ima2.js backfill-thumbs --help
node bin/ima2.js doctor --help
node bin/ima2.js gen --help
node bin/ima2.js edit --help
node bin/ima2.js multimode --help
node bin/ima2.js video frame --help
```

## 10. 완료 기준

- 모든 help activation scenario가 exit 0이며 filesystem/API side effect가 없다.
- backfill의 전체/부분 실패가 exit 1, 완전 성공이 exit 0이다.
- 네 model alias가 모든 지정 command에서 정식 ID로 전송된다.
- 기존 정식 model/provider 계약과 source literal contract가 유지된다.
- `-o`, `-n/--count`, `--output` 하위호환 case가 모두 통과한다.
- `@last`가 show/edit/metadata/video ref에서 최신 history 이미지를 가리키며 빈 history는
  생성 호출 전에 일관되게 실패한다.
- `npm run build:cli` 후 TS/JS가 동기화되고 관련 CLI 계약 테스트가 모두 통과한다.

## 부록 A — 후속 제안(040 구현 제외)

## 부록 B — WP3 audit fold-back (2026-07-15, GO-WITH-FIXES 0 blocker)

1. `@last` runtime 테스트: tests/cli-commands.test.js는 live-server fixture만 있음
   (`server.ts` spawn, :39-64). `@last` 테스트는 그 live-server fixture를 재사용해
   실제 history에 이미지를 만든 뒤 검증하거나, 신규 mock HTTP 서버 파일로 분리한다.
   구현자가 더 싼 쪽 선택 — 단 사용자 실제 gallery는 절대 건드리지 않는다
   (IMA2_GENERATED_DIR 임시 격리 필수).
2. doctor top-level dispatch는 doctor.ts:215-220 (문서의 59-83은 image-probe help).
3. history 응답 키는 `{ items, total, nextCursor }` — `items ?? history` fallback은
   제거하고 `items`만 사용.
4. `HISTORY_EMPTY`는 빈 history 전용. resolver가 반환한 filename의 파일 부재는
   fileToDataUri의 일반 파일 오류 경로로 두되 메시지에 filename 포함 확인.
5. video frame `-o foo --out bar` 동시 사용의 우선순위가 변경됨(output=foo →
   out=bar). 하위호환 주장 대신 **동시 사용 시 exit 2** (multimode -n/--count와
   동일 정책)로 통일. 충돌 감지는 parseArgs 이전 raw argv 검사로 구현.
   `--count=6` 형태와 옵션 반복도 테스트에 포함.

- prompt-only 기본 서브커맨드: command 오타가 생성 요청으로 바뀌므로 별도 안전성 설계 필요
- `config`/`defaults` 통합: deprecation 기간과 설정 source-of-truth 결정 필요
- `ps`/`inflight` 통합: 자동화 사용자 호환성 조사 후 별도 phase로 수행
- 선언형 command registry: 현재 source-regex 계약을 먼저 behavior 계약으로 전환해야 함
- `--json` 오류 envelope 통일: stdout/stderr 및 exit-code 공개 계약을 별도 PRD에서 정의
