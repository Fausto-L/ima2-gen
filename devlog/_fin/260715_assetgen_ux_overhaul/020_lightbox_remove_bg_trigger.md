# 020 — 라이트박스/뷰어에서 배경 제거 트리거

> **상태: DONE (2026-07-15).** luna 감사 near-pass 반영. 라이브 검증: asset-gen
> 레일/assets 탭 라이트박스 모두 버튼 노출, KeyingPanel 정상 오픈, Save to
> project 후 assets 17→18 갱신(키잉 결과 반영). ui build clean.

## 문제

에셋을 확대(라이트박스)하거나 레일/에셋 뷰어에서 보고 있을 때 배경 제거로
들어가는 동선이 전혀 없다. "Remove background" 버튼은 asset-gen 결과 그리드
타일에만 존재. 초보자가 확대해서 보다가 "이거 배경 지우고 싶다"를 할 수 없음.

## Diff-level 계획

- `ui/src/components/assetgen/AssetMediaLightbox.tsx`
  - store에서 `setKeyingTarget` 사용. footer를 (이미지 zoom 버튼 || 키잉 가능)
    조건으로 항상 렌더하고, `item.kind !== "edit" && item.filename`이면
    "배경 제거" 액션 버튼 추가(이미지+비디오 모두, 비디오는 알파 WebM 경로).
  - 클릭 시 `setKeyingTarget(item)` 후 `onClose()` → KeyingPanel 열림.
- `ui/src/components/assets/AssetsWorkspace.tsx`
  - `<KeyingPanel />` 마운트(현재 asset-gen에만 있어 assets 탭에서는 키잉
    타깃을 설정해도 패널이 안 뜸).
  - keyingTarget이 set→null로 닫히면 `loadAssets(true)`로 목록 갱신(키잉
    결과 에셋 반영).
- CSS `.assetgen-lightbox__keybtn`: accent 강조 버튼.
- i18n: 기존 `keying.open` 재사용, 신규 키 없음.

## 수용 기준

- asset-gen 레일/그리드에서 확대 → 라이트박스 하단 "배경 제거" 클릭 →
  KeyingPanel이 해당 에셋으로 열림 (스크린샷).
- assets 탭에서 미리보기 → 동일 동작, 저장 후 목록에 키잉 결과 반영.
- 이미 키잉된 에셋(kind=edit)에는 버튼 없음. typecheck/ui build clean.
