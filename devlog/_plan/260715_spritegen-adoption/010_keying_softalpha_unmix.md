# 010 — 키잉 품질: soft-alpha unmix 이식

상태: diff-level 설계 (WP2 구현 사이클에서 소비).
대상: `ui/src/lib/canvas/` (+ KeyingPanel 통합).

## sprite-gen의 핵심 기법 (근거: /tmp/sprite-gen/sprite_gen/extract.py)

### 1. Blend-model unmix (extract.py:53-89)

경계 픽셀을 "피사체색과 키색의 선형 혼합"으로 모델링하고 역산한다.

```
C_obs = (1-k)·C_subject + k·C_key
k = min(T(C_obs)/T(C_key), 1)        # T = keyed채널평균 - unkeyed채널평균
coverage = 1-k
C_subject = (C_obs - k·C_key) / (1-k)
alpha_out = alpha_in · coverage
```

지금 colorKey.ts는 거리 기반 feather(pow 램프)만 있어서 반투명 경계의 **색**은
원본(키색이 섞인 채)을 유지한다. unmix는 색 자체를 복원하므로 머리카락·안경 등
반투명 디테일에서 체감 차이가 크다. v1.12의 "fringe peel"(경계 픽셀 삭제)이
실루엣을 깎아먹어서 v1.13에서 unmix로 전환한 이력이 교훈 (CHANGELOG.md:280-304).

### 2. Key-depth 제한 (extract.py:92-191)

unmix를 전역 적용하지 않고, hard-key 영역으로부터 Chebyshev 거리 `unmix_reach`
이내의 픽셀에만 적용. 키 색조가 있어도 배경에서 먼 픽셀(피사체 소재색)은 보존.
우리의 031 border-contiguity gate와 같은 철학의 다른 축 — 계약이 잘 맞는다.

### 3. Trapped-spill despill (extract.py:193-246)

잔여 키 색조 픽셀 중 **작은 connected cluster**만 spill로 보고 RGB만 보정(alpha
유지). 큰 cluster는 "원래 그 색인 소재"로 판단해 보존. 머리카락 틈새 spill 처리에
효과적이고 wandErase와 충돌 없음.

## 우리가 유지할 것 (sprite-gen이 못하는 부분)

- CbCr 거리 기반 키잉 (sprite-gen 기본 경로는 RGB Euclidean, extract.py:249-269)
- 무채색 키 하드닝 + border-contiguity (031) — sprite-gen 기본 경로에 없음
- 3×3 distance smoothing, opaque-foreground despill, edge morphology (030)

## 구현 스케치

| WP | 내용 | 난이도 |
|---|---|---:|
| 010-1 | `ui/src/lib/canvas/softUnmix.ts` 신규: blend unmix + key-depth BFS. PixelBuffer 계약, node:test 구동 | M |
| 010-2 | trapped-spill cluster despill (같은 모듈, CC는 wandErase 패턴 재사용) | M |
| 010-3 | applyColorKey feather band에 unmix 통합 (거리 램프 → coverage 램프), 파라미터 하위호환 | M |
| 010-4 | KeyingPanel 고급 토글 + 회귀 테스트 (스크린샷 시뮬레이션 케이스 포함) | S |

## Diff-level 설계 (2026-07-15 승격)

### 적용 범위 결정

unmix는 **유채색 키(green/magenta 등)에만** 적용한다. 무채색 키(흰/검)는
T(C) 텐트 점수가 정의되지 않으며(keyed/unkeyed 채널 구분 불가), 이미 031
하드닝(채도 상한 + border-contiguity)이 소유한다. `keySaturation < 40`이면
unmix 경로를 건너뛴다 (colorKey.ts:96의 기존 `isAchromaticKey` 판정 재사용).

### NEW `ui/src/lib/canvas/softUnmix.ts` (자체 완결, DOM 독립)

```ts
export type SoftUnmixParams = {
  keyColor: RGB;
  /** hard-key 영역으로부터 Chebyshev 거리 상한. 0 = 비활성. 기본 4 */
  reach: number;
  /** trapped-spill 클러스터 최대 크기 (전경 픽셀 대비 비율). 기본 0.02 */
  spillMaxFraction: number;
};

/** T(C): keyed 채널 평균 - unkeyed 채널 평균 (sprite-gen extract.py:53-74) */
export function keyTintScore(r: number, g: number, b: number, key: RGB): number;

/**
 * keyed(=applyColorKey 결과)를 source 원본과 대조해 경계 unmix.
 * k = min(T(obs)/T(key), 1); coverage = 1-k;
 * subject = (obs - k*key)/(1-k) [채널별 0-255 clamp];
 * alphaOut = round(alphaIn * coverage) — 단 alphaIn=0(hard-keyed)은 그대로.
 * keyed를 in-place 수정. 무채색 키면 no-op 반환.
 */
export function applySoftUnmix(
  keyed: PixelBuffer, source: PixelBuffer, params: SoftUnmixParams,
): void;
```

내부 단계 (extract.py:92-246 이식, 함수당 50줄 분할):

1. `computeKeyDepth`: alpha=0 픽셀을 seed로 8방향 BFS, Chebyshev 거리 맵
   (Int16Array, reach 초과는 -1). wandErase의 Int32Array 큐 패턴 재사용.
2. 픽셀 분류: `T(obs) <= 0` → SUBJECT(불변). 그 외 키 색조 픽셀 중
   depth in [1, reach] → unmix 적용. depth 밖 키 색조 픽셀 → 3단계 후보.
3. trapped-spill: 남은 키 색조 픽셀(alpha>0)의 4-연결 클러스터를 flood-fill로
   수집, 크기 ≤ spillMaxFraction × 전경픽셀수 인 클러스터만 RGB despill
   (subject 복원값으로 교체, **alpha 유지**). 큰 클러스터 = 소재색, 불변.

### MODIFY `ui/src/components/assetgen/KeyingPanel.tsx`

re-key 이펙트의 파이프라인 순서 (현행 applyColorKey → eraseSeedRegions):

```ts
const keyed = applyColorKey(src, { keyColor, tolerance, softness, spill });
if (unmixEnabled) {
  applySoftUnmix(keyed, src, { keyColor, reach: 4, spillMaxFraction: 0.02 });
}
if (eraseSeeds.length > 0) eraseSeedRegions(keyed, src, eraseSeeds, tolerance);
```

- 고급 패널에 `unmixEnabled` 토글 추가 (기본 ON, 무채색 키면 비활성 표시).
- i18n 키: `keying.unmix`, `keying.unmixHint` (en/ko).
- `applyColorKey` 시그니처는 불변 (하위호환).

### NEW `tests/soft-unmix.test.ts`

| 케이스 | 활성화 시나리오 |
|---|---|
| 50% green-blend 픽셀 복원 | subject (200,40,40)와 GREEN 50% 혼합 픽셀 → unmix 후 RGB≈subject±10, alpha≈128±16 |
| reach 제한 | hard-key 영역에서 reach 밖의 초록끼 픽셀은 불변 (소재색 보존) |
| trapped-spill | 전경 내부 작은 green 클러스터 → RGB despill + alpha 유지; 큰 green 블록 → 불변 |
| 무채색 no-op | 흰 키에서 applySoftUnmix 호출 시 버퍼 바이트 불변 |
| 말라붙은 입력 | 빈/불일치 버퍼 throw |

### 검증 절차 (WP2 C 단계)

1. `node --test tests/soft-unmix.test.ts tests/color-key.test.ts tests/wand-erase.test.ts`
   — 기존 13+5건 유지 + 신규 통과.
2. `npm run typecheck:tests`, `cd ui && npm run build`.
3. 스크린샷 시뮬레이션: green 배경 + 머리카락 반투명 경계 64×64 버퍼에서
   경계 픽셀 G 채널이 unmix로 감소함을 수치로 확인 (C 증거로 캡처).
4. `npm run test:inventory` 재생성.

수용 기준: 기존 color-key.test.ts 13건 + wand-erase 5건 전부 유지, 위 표의
신규 회귀 전부 통과, UI 토글의 렌더 확인.
