# 050 — CLI 생성 기본값: luna / grok video 1.5 / imagine quality

상태: diff-level 설계 (WP4 구현 사이클에서 소비).
경계: 040은 CLI 표면(도움말/플래그)만, 050은 기본값 **값**과 그 파급만 소유.

## 변경 대상 (전부 MODIFY) — WP4 audit round 1 FAIL 반영 전면 확장

범위 결정(가정 명시): 사용자 요구는 "ima2 CLI 생성 기본값"이지만, UI 초기 선택값이
구 기본값으로 남으면 제품이 이중 기본값을 갖는다. **제품 전반 기본값**으로 통일한다
(UI 포함). CLI 전용으로 좁히려면 이 결정을 뒤집을 것.

### 1층 — config 기본값 (원계획)

| 파일:라인 | before | after |
|---|---|---|
| `config.ts:263` imageModels.default | `"gpt-5.4-mini"` | `"gpt-5.6-luna"` |
| `config.ts:277` apiProvider.defaultImageModel | `"gpt-5.4-mini"` | `"gpt-5.6-luna"` |
| `config.ts:294` grokProvider.defaultImageModel | `"grok-imagine-image"` | `"grok-imagine-image-quality"` |
| `config.ts:297` grokProvider.defaultVideoModel | `"grok-imagine-video"` | `"grok-imagine-video-1.5"` |

### 2층 — 공유 상수/어댑터 하드코드 fallback (audit blocker 1)

- `lib/imageModels.ts:3` (GPT 기본 상수), `:9` (grok 이미지), `:106,142`
  (GROK_FALLBACK_VIDEO_MODEL 계열)
- `lib/grokVideoAdapter.ts:108`, `lib/providerOptions.ts:65`,
  `lib/responsesImageAdapter.ts:296,375,414`, `lib/oauthProxy/generators.ts:38`,
  `lib/oauthProxy/multimodeGenerators.ts:46,193`, `lib/agentQuestionResponder.ts:78`,
  `lib/responsesDoctor.ts:424`, `lib/agentSettings.ts:15`, `lib/grokImageAdapter.ts:302,374,419`,
  `lib/grokMultimodeAdapter.ts:35`, `bin/commands/doctor.ts:99`
- 가능하면 리터럴을 lib/imageModels.ts 상수 import로 수렴 (기존 구조 유지 범위에서).

### 3층 — 서버 무모델 경로 (audit blocker 2, 필수)

`routes/video.ts:220-228`: rawModel 부재 시 `normalizeGrokVideoModel(undefined)` →
base 고정. 수정: rawModel 부재 시 `ctx.config.grokProvider.defaultVideoModel`을
먼저 적용한 뒤 normalize. `tests/videoRoute.test.ts`에 "무모델 요청이 1.5로
정규화되는" 회귀 추가 (활성화 시나리오: model 필드 없는 POST → adapter가 1.5 수신).

### 4층 — UI 초기 선택값

- `ui/src/lib/imageModels.ts:3,18,76`, `ui/src/store/storeSettingsImpl.ts:25,105`,
  `ui/src/store/storeAssetGenImpl.ts:19`, `ui/src/lib/agentGenerationSettings.ts:9`
- 기존 사용자의 저장된 선택(localStorage/persist)은 건드리지 않는다 — 초기값만.

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

## 테스트 영향 (audit round 1에서 재분류)

실제 코드 기본값을 검증(갱신 필수):

- `tests/config.test.js:79` — imageModels.default 단언
- `tests/image-model.test.ts:8-9` — 기본 모델 단언
- `tests/gpt56-rollout-contract.test.ts:42-44` — 기본값 유지 단언
- 신규: videoRoute 무모델 → 1.5 정규화 회귀
- 어댑터 하드코드 fallback을 단언하는 테스트는 rg로 찾아 개별 판단

픽스처 주입이라 무관(손대지 않음): card-news-contract(자체 config 픽스처),
videoRoute:126,140-155(명시 모델), grokVideoAdapter 대부분(명시 픽스처),
cli-video/cli-capabilities의 valid 목록 계약, api-provider-parity의 명시 모델 케이스.
videoExtendedRoute:139은 route 자체 fallback 계약 — base 유지 여부를 B에서
명시 판단(extend 경로는 원본 영상의 모델 계승이 자연스러움).

원칙: "기본값이 X" 단언만 갱신. 명시 모델 테스트가 깨지면 구현 회귀로 간주.

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
