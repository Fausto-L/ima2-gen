# 032 — 키잉 패널 클릭 지우기 (magic wand)

## 요청 (2026-07-15)

자동 키잉만으로 부족할 때 사용자가 직접 "빈 공간"을 클릭해 그 영역만
지울 수 있는 인터랙션. 031(무채색 키 하드닝)의 후속.

## 구현

### `ui/src/lib/canvas/wandErase.ts` (신규)

- `eraseSeedRegions(target, source, seeds, strength)`: 클릭 시드마다
  원본 픽셀 기준 flood-fill(4방향, max-채널 거리 — 캔버스 모드
  `backgroundRemoval.ts`와 동일 규약)로 이어진 영역의 alpha를 0으로.
- 매칭은 항상 SOURCE 픽셀 기준 → 키잉 결과와 무관하게 클릭 동작 일관.
- `wandByteTolerance`: 패널의 제거 강도(0-100) → 바이트 톨러런스(×0.7,
  기본 40 → 28 = 캔버스 모드 기본값과 동일).
- `backgroundRemoval.ts` 재사용 대신 자체 구현인 이유: 그쪽 내부 import가
  확장자 없는 경로라 node:test 직접 구동 불가(WIP 파일이라 미수정).

### `ui/src/components/assetgen/KeyingPanel.tsx`

- 프리뷰 클릭 모드 토글: "클릭해서 지우기"(기본) / "키 색 선택"(기존
  스포이드). 비디오는 서버 ffmpeg 키잉이라 지우기 모드 숨김.
- 클릭 시드 누적 + "클릭 취소 (n)" 버튼, 이미지 교체·Reset 시 시드 초기화.
- 저장/다운로드는 캔버스 스냅샷 그대로라 클릭 지우기 자동 반영.
- i18n en/ko 5키 추가(clickMode/modeErase/modePick/eraseHint/undoClick).

## 검증

- `tests/wand-erase.test.ts` 신규 5건: 클릭 영역만 제거(벽 너머 보존),
  다중 클릭 누적, SOURCE 기준 매칭, no-op/사이즈 검증.
- `tests/asset-gen-keying-preview-contract.test.js`에 완드 배선 계약 1건 추가.
- `npm test` 1296/1298 (잔여 2건은 031에서 확인한 병렬 WIP 소산),
  `typecheck:tests`, `cd ui && npm run build`, `test:inventory` 재생성 통과.
