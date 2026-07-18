# 031 — 무채색(흰/검) 키 하드닝: 배경만 정확히 제거

## 문제 (사용자 스크린샷, 2026-07-15)

흰 배경 키잉에서 배경이 아닌 픽셀까지 광범위하게 날아감:

- 얼굴 하이라이트(밝은 부분)에 구멍이 뚫림
- 연한 피부(다리)가 반투명/제거됨 — 밝기만 흰색과 비슷하면 전역으로 키잉

원인: `ui/src/lib/canvas/colorKey.ts`의 무채색 키 분기가
`hypot(chromaDist, |Y-keyY|*0.8)`를 전 픽셀에 전역 적용. 밝은 피부는
chroma 거리(~18)와 luma 거리(~18)의 합성이 tolerance 40(=거리 48) 안에
들어와 배경과 무관하게 제거됨. 배경과 연결되지 않은 내부 하이라이트도
같은 이유로 뚫림.

## 수정 (2026-07-15 적용)

`applyColorKey`의 무채색 키 경로 2중 가드:

1. **채도 상한(chroma cap)**: `chromaDist > 10 + tolerance*0.15`(기본 16)인
   픽셀은 sentinel(400)로 마킹 — 흰/검 키에서 색이 있는 픽셀(피부, 웜섀도)은
   밝기가 비슷해도 절대 키잉하지 않음. 3×3 박스필터에서 sentinel은 평균에서
   제외(경계 배경 픽셀에 번져 흰 테두리 halo가 생기는 것 방지).
2. **테두리 연결성 게이트(border contiguity)**: 키잉 후보 픽셀 중 이미지
   가장자리와 (다른 후보 픽셀을 통해) 연결된 것만 실제 제거. 인물 내부에
   갇힌 흰 하이라이트·검은 디테일은 불투명 유지. BFS(Int32Array 큐), O(n).

그린 키 경로는 변경 없음(글로벌 키잉이 크로마 스크린의 정답 — OBS/ffmpeg 동일).
UI 파라미터(tolerance/softness/spill) 의미·시그니처 불변.

## 검증

- `tests/color-key.test.ts`에 회귀 3건 추가 (achromatic keys, hardening 031):
  밝은 피부 보존(흰 키), 내부 하이라이트 보존(연결성), 검정 키에서 어두운
  유색 피사체 보존. 13/13 통과.
- 64×64 스크린샷 시뮬레이션(흰 배경 + 머리카락 + 피부 + blown highlight):
  배경 alpha 0, 피부/하이라이트/머리카락 모두 255.
- `npm run typecheck`, `typecheck:tests`, `cd ui && npm run build` 통과.
- `npm test` 잔여 실패 2건(라이트박스 계약, structure 라인수 계약)은 병렬
  진행 중인 assetgen WIP 소산으로 이 변경과 무관.
