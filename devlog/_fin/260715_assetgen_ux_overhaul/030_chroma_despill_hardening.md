# 030 — 크로마키 despill 하드닝 (초록 잔여물 제거)

## 문제 (사용자 스크린샷, 2026-07-15)

키잉 결과에서 머리카락 가닥·경계에 초록 프린지/스필이 남음. 원인 분석:

1. `ui/src/lib/canvas/colorKey.ts::applyColorKey`의 스필 억제가
   **feather band(0<alpha<255) 안에서만** 동작 — 완전 불투명(alpha=255)인
   전경 픽셀의 초록 물듦은 전혀 처리 안 됨. 프로덕션 키어(OBS/ffmpeg/Nuke)는
   despill을 알파와 독립적으로 불투명 전경에도 적용.
2. 알파 램프가 픽셀 단독 CbCr 거리의 선형 램프 — OBS는 3×3 이웃 박스필터로
   거리를 부드럽게 한 뒤 `pow(x, 1.5)` 램프 사용(경계 품질↑).
3. 생성 단계: chroma-green 프롬프트 서픽스가 배경 균일성만 요구하고
   피사체에 초록 반사/림라이트 금지를 명시하지 않음 → 모델이 스필을
   그려 넣음.

## 근거 (lunasearch 스웜, 1차 소스 오픈 검증)

- OBS `chroma_key_filter.effect`: YUV 거리, 3×3 필터, `alpha=saturate((d-sim)/smooth)^1.5`,
  despill은 루마 보존 탈채도(`rgb = mix(gray(luma), rgb, spillVal)`)를 불투명 픽셀에도 적용.
- ffmpeg `vf_despill.c`: `spillmap = max(g - (mix*r + factor*b), 0)` 후 채널 보정(`greenscale=-1`
  → 초과 초록 제거). Natron Despill limiter 계열(mix 0=blue, 0.5=avg, 1=red) 동일.
- OSS JS/WebGL(gl-chromakey, threejs_chromakey): OBS 패턴 그대로 — 파워 램프 + 루마 블렌드.
- 비디오 경로(`lib/videoChromaKey.ts:86`)는 이미 `despill=type=green` 사용 — 이미지 경로만 격차.

## Diff-level 계획

### `ui/src/lib/canvas/colorKey.ts`

- 알파: CbCr 거리를 3×3 박스필터(대각 가중 없이 단순 평균으로 충분)로 완화한 뒤
  `alpha = clamp((d - t0)/(t1 - t0), 0, 1)^1.5 * 255`.
- despill(신규, 알파 독립): 모든 alpha>0 픽셀에 ffmpeg-limiter 방식
  `spillmap = max(g - (r + b) / 2, 0)`(avg limiter)을 거리 기반 가중과 곱해 적용:
  `w = 1 - clamp((d - t0) / despillBand, 0, 1)` (despillBand = t1-t0 + (spill/100)*120),
  `g' = g - spillmap * w * (spill/100)`. 키 색상 근처일수록 강하게, 먼 초록
  (에메랄드 눈동자 등)은 약하게 → 정당한 초록 보존.
- 기존 UI 파라미터 3개(tolerance/softness/spill) 의미 유지, 시그니처 불변.
- 기존 테스트 계약 유지: band 부분알파, spill=100에서 `g ≤ max(r,b)`, 불변성.

### `lib/backgroundPresets.ts`

- chroma-green 서픽스에 스필 금지 문구 추가: 피사체에 green color cast /
  green rim light / green reflections 금지. planner constraint에도 동일 반영.

### 테스트 `tests/color-key.test.ts`

- 신규 케이스: (a) 불투명 전경 픽셀의 초록 캐스트가 despill로 감소,
  (b) 키 색상에서 먼 초록(저채도 teal)은 보존, (c) 기존 케이스 전부 그린 유지.

## 수용 기준

- `npm test`(color-key 포함) + typecheck + ui build clean.
- 실제 모에화 에셋 재키잉 스크린샷에서 머리 경계 초록 프린지 육안 감소,
  픽셀 측정: 결과 알파>0 픽셀 중 green-dominant(g > max(r,b)+24) 비율이
  하드닝 전 대비 감소.
- 눈동자/보석의 초록은 유지(스크린샷).

## 잔여/보류 (Gauss 레인 — 생성 단계 대안)

- gpt-image 네이티브 투명 배경(`background:"transparent"`) 지원 여부 조사 중.
  지원 시 별도 work-phase로 "투명 배경 직접 생성" 옵션 추가 검토.
