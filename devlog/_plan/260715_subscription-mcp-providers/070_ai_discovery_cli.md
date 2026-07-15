# 070 — AI discovery CLI: machine contract entrypoint + skill projection

> **Post-interview canonical (2026-07-16).** WP7. 인터뷰 Goal의 최종 판정 질문 — "깨끗한 환경의 AI가 별도 설명 없이 ima2 CLI를 보고, 알려진 tool과 지금 호출 가능한 tool을 구분하고, 올바른 입력을 구성할 수 있는가" — 를 CLI 표면으로 구현하는 phase다. 020 catalog와 040 snapshot이 선행한다.

## 목적

AI가 1회 학습으로 쓸 수 있는 machine-readable contract entrypoint를 만든다. 사람용 help text가 아니라 JSON 계약이 1급 출력이다.

## CLI 계약 (diff-level)

```bash
ima2 tools list --json                    # 전체 catalog: id, namespace, availability, 요약
ima2 tools list --namespace mcp.higgsfield --json
ima2 tools show mcp.higgsfield.<tool> --json   # 전체 contract: inputSchema/output/error/provenance
ima2 tools schema ima2.video.extend --json     # inputSchema만 (호출 직전 재확인용)
ima2 tools call <id> --input '<json>'          # 실행: 030 runtime에 위임, typed error 반환
```

응답 봉투(모든 subcommand 공통):

```json
{ "ok": true, "data": { ... }, "catalogVersion": "<hash>", "generatedAt": "<ts>" }
{ "ok": false, "error": { "code": "auth_required|unavailable|schema_changed|unknown_tool", "detail": "..." } }
```

규칙:

- `list`는 availability를 항상 포함하고, `documented`-only tool의 `call`은 network 시도 전에 typed `auth_required`/`unavailable`로 거부한다.
- description은 quoted data로 출력한다 (020 trust 규칙).
- server 미기동 시 `list/show/schema`는 번들/캐시 snapshot으로 동작하되 `availability.evidence`에 offline 판정 근거를 남긴다. `call`은 server 필수.

## Skill/docs projection

- `skills/ima2/SKILL.md`의 MCP provider 섹션과 `docs/` provider reference를 catalog에서 생성한다: `scripts/generate-contract-docs.mjs`가 catalog → Markdown projection을 렌더링하고, CI diff 검사로 수기 drift를 막는다.
- `ima2 skill` 설치 경로는 유지 — 생성물이 기존 skill 파일을 대체한다.

## File change map

| Op | Path | 변경 |
|---|---|---|
| NEW | `bin/commands/tools.ts` | 위 CLI 계약 구현. server API 우선, snapshot fallback. |
| MODIFY | `bin/ima2.ts` | `tools` subcommand 등록 + `ima2 capabilities` help에서 machine entrypoint로 `ima2 tools`를 안내. |
| NEW | `routes/contracts.ts` | `GET /api/contracts`, `GET /api/contracts/:id` — catalog projection API. |
| MODIFY | `routes/index.ts` | contracts route 등록. |
| NEW | `scripts/generate-contract-docs.mjs` | catalog → skill/docs Markdown projection 생성기. |
| MODIFY | `skills/ima2/SKILL.md` | MCP provider 섹션을 generated marker 블록으로 전환. |
| NEW | `tests/tools-cli-contract.test.ts` | 봉투 shape, availability 구분, documented-call 거부, offline fallback, secret-free. |
| NEW | `tests/contract-docs-projection.test.ts` | 생성물 결정성(같은 catalog → 같은 출력), generated marker 보존. |

## Conditional activation scenarios

- Clean install discovery: server 없이 `ima2 tools list --json`이 번들 snapshot 기반 `documented` 목록을 반환한다.
- 오판 방지: `documented` tool에 `tools call`을 시도하면 upstream network 호출 0회로 typed 거부된다.
- schema 재확인: `tools schema`가 stale 상태에서 `schema_changed`를 반환하고 이전 schema를 반환하지 않는다.
- 문서 drift: catalog 변경 후 projection 미생성 상태를 CI diff가 잡는다.

## Acceptance criteria

- 깨끗한 설치에서 AI가 `ima2 tools list/show/schema --json`만으로 tool 존재·입력 schema·호출 가능 여부를 구분할 수 있다 (090 Tier 1 golden task의 대상 표면).
- 모든 오류가 typed code로 반환되고 자유 텍스트 추측이 필요 없다.
- skill/docs의 provider 섹션이 catalog 생성물로 대체되고 수기 drift가 CI에서 차단된다.

## Verification

```bash
npm run typecheck
npm run typecheck:tests
node --test --import tsx tests/tools-cli-contract.test.ts tests/contract-docs-projection.test.ts
node scripts/generate-contract-docs.mjs --check
npm run test:inventory
```
