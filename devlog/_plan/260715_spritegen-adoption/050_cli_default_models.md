# 050 — CLI 생성 기본값: luna / grok video 1.5 / imagine quality

상태: diff-level 설계 (WP4 구현 사이클에서 소비).
경계: 040은 CLI 표면(도움말/플래그)만, 050은 기본값 **값**과 그 파급만 소유.

## 변경 대상 (전부 MODIFY)

| 파일:라인 | before | after |
|---|---|---|
| `config.ts:263` imageModels.default | `"gpt-5.4-mini"` | `"gpt-5.6-luna"` |
| `config.ts:277` apiProvider.defaultImageModel | `"gpt-5.4-mini"` | `"gpt-5.6-luna"` |
| `config.ts:294` grokProvider.defaultImageModel | `"grok-imagine-image"` | `"grok-imagine-image-quality"` |
| `config.ts:297` grokProvider.defaultVideoModel | `"grok-imagine-video"` | `"grok-imagine-video-1.5"` |
| `lib/grokVideoAdapter.ts:108` fallback 리터럴 | `"grok-imagine-video"` | `"grok-imagine-video-1.5"` |

env(`IMA2_IMAGE_MODEL_DEFAULT` 등)와 파일 설정(`~/.ima2` fileCfg) 오버라이드는
`pickStr` 우선순위 그대로 유지 — 코드 기본값만 바뀐다.

유지 결정:

- card-news 전용 모델 경로는 **유지** (독립 기능 기본값, 이 문서 범위 밖).
  tests/card-news-contract.test.ts:60-61,168,204 의 단언은 card-news 파이프라인이
  전역 기본값을 따라가는지 여부를 WP4 P에서 재검증 후, 따라간다면 기대값만 갱신.
- `grok-imagine-video` 모델 자체는 valid 목록에 유지 (기본값만 1.5).
- video generate의 `--resolution` 기본 480p 유지. 1.5가 기본이 되므로 1080p
  요구 조건 문구는 성립하지만 도움말 문구(video.ts:119)를 "기본 모델이 1.5"에
  맞게 손질.

## TS/JS 이중 산출물 (audit blocker 1 반영)

`lib/*.js`, `bin/**/*.js`는 커밋된 컴파일 산출물. TS 변경 후 반드시:

```bash
npm run build:server && npm run build:cli
```

재생성된 `lib/config.js`, `lib/grokVideoAdapter.js`, `bin/commands/*.js` 를
같은 커밋에 포함. 검증: `rg -n "gpt-5.4-mini|grok-imagine-video\"" lib/config.js
lib/grokVideoAdapter.js` 가 stale 기본값을 반환하지 않을 것.

## 테스트 영향 전수 목록 (audit blocker 2 반영)

기대값 갱신 대상 (WP4 B에서 하나씩 확인):

- `tests/config.test.js:79` — imageModels.default 단언
- `tests/image-model.test.ts:8-9` — 기본 모델 단언
- `tests/gpt56-rollout-contract.test.ts:42-44` — 기본값 유지 단언
- `tests/card-news-contract.test.ts:60-61,168,204` — card-news 모델 (유지/갱신 판단)
- `tests/videoRoute.test.ts:126,140-155,185-210,241,275,280` — video 기본/fallback
- `tests/videoExtendedRoute.test.ts:139,219-222`
- `tests/grokVideoAdapter.test.ts:115-193,354-388,393-419` — adapter fallback 계약
- `tests/cli-video-command-contract.test.js:91,151-158`
- `tests/cli-capabilities-contract.test.js:37-40`
- `tests/api-provider-parity.test.ts` grok 이미지 모델 참조 12곳 — 명시 모델 전달
  케이스는 불변, 기본값 경유 케이스만 갱신
- `tests/grok-planner-adapter.test.ts:49,92-99,123-143,184-200,247-263`
- `tests/prompt-fidelity.test.ts:171`

원칙: 명시적으로 모델을 전달하는 테스트는 손대지 않는다. "기본값이 X"를
단언하는 테스트만 새 기본값으로 갱신. 기본값 경유가 아닌데 실패하는 테스트가
나오면 회귀로 간주하고 구현을 고친다.

## 도움말/문서 동기화

- `bin/commands/gen.ts` / `edit.ts` / `multimode.ts` 도움말에 "Default: gpt-5.6-luna" 표기
- `bin/commands/video.ts:119,121` 도움말 기본 모델 문구 갱신
- `bin/commands/defaults.ts` — 표면 문구는 040 소관, 값 자체는 서버 config가 소유하므로 코드 변경 없음
- `docs/API.md` 의 기본 모델 언급부 갱신 (rg로 확인)
- `skills/ima2/SKILL.md` 의 모델 기본값 서술 갱신

## 활성화 시나리오 (C 단계 증거)

1. `node -e "import('./config.ts').then(m=>console.log(m.config.imageModels.default))"`
   → `gpt-5.6-luna` (또는 config.test.js 갱신 통과 출력)
2. `node bin/ima2.js capabilities` (서버 기동 시) 또는 해당 계약 테스트 —
   video 기본 모델이 1.5로 보고됨
3. env 오버라이드 활성화: `IMA2_IMAGE_MODEL_DEFAULT=gpt-5.4 node -e ...` →
   `gpt-5.4` (pickStr 우선순위 경로가 살아있음을 증명)
4. `npm test` 신규 실패 0 (기존 WIP 실패 2건 제외), `npm run build:server`,
   `npm run build:cli` 후 git diff에 재생성 JS 포함 확인
