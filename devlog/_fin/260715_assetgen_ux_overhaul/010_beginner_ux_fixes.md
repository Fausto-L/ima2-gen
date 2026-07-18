# 010 — Asset-gen / Asset viewer beginner UX overhaul (WP: bugfix + rail)

> **상태: DONE (2026-07-15).** B1/B2 전부, B3는 Erdos P0 4건 + P1 퀵윈 반영.
> 검증: GPT e2e 생성 성공(`f_1784094851726_luzyl` succeeded:1), 에셋
> `a_01KXJ5G8H2TDJJNQ82A90J9ABE` source=asset-gen 귀속, typecheck/ui build clean,
> 라이브 스크린샷 4장. 잔여: P1-1(폼 2단계 재구성), P2 전체 → 다음 사이클.

## 무슨 일이 있었나 (진단, 2026-07-15)

1. `POST /api/generate` 400 × 2 — `~/.ima2/generation-request-log.json`에
   `INVALID_IMAGE_MODEL`로 기록됨 (`f_1784093853309_z4uj2`, `f_1784093858882_uydr7`).
   원인: `storeAssetGenImpl.ts::assetGenModel()`이 GPT provider일 때 전역
   `s.imageModel`을 검증 없이 그대로 보냄. 전역 모델이 GPT 계열이 아니면
   서버 `normalizeImageModel()`이 400으로 거부. UI에는 토스트만 뜨고
   결과 패널에는 아무 표시가 없어 "아무 일도 안 일어남"으로 보임.
2. Generate 버튼 색 이상 — 모노크롬 테마에서 `--accent: #f0f0f4`(거의 흰색)인데
   `assetgen-workspace.css:16`이 `color: var(--accent-contrast, #fff)` 사용.
   `--accent-contrast`는 어디에도 정의돼 있지 않아 흰 버튼 + 흰 글자.
   올바른 토큰은 `--accent-ink: #0b0b0f`.

## Diff-level 계획

### B1 — 버그 수정 (P0)

- `ui/src/styles/assetgen-workspace.css`
  - `.assetgen-generate`의 `color`를 `var(--accent-ink, #0b0b0f)`로 교체.
- `ui/src/store/storeAssetGenImpl.ts`
  - `assetGenModel()`: GPT 경로에서 `s.imageModel`이 GPT 이미지 모델 집합에
    속할 때만 전달, 아니면 `undefined` 반환(서버 기본 모델 fallback).
  - `generateAssetGenImpl()`: 시작 시 `assetGenLastError` 클리어, catch에서
    사람이 읽을 수 있는 메시지로 `assetGenLastError` 세팅(토스트와 병행).
- `ui/src/store/storeTypes.ts` / `useAppStore.ts`: `assetGenLastError: string | null`
  + 초기값/세터 배선.
- `ui/src/components/assetgen/AssetGenWorkspace.tsx`: 결과 패널 상단에
  dismiss 가능한 인라인 에러 배너(제목 + 원문 메시지 + 다음 행동 힌트).

### B2 — 프로젝트 갤러리 레일 (브라우저 코멘트 2)

- 신규 `ui/src/components/assetgen/AssetGenProjectRail.tsx`
  - 선택된 프로젝트(`selectedProjectId`, 미선택 시 전체)의 에셋을
    `getAssets({ folderId, limit })`로 로드해 세로 썸네일 열로 표시.
  - 새 에셋 등록(`assetGenItems` 변화) 시 재조회.
  - 클릭 → 선택 하이라이트 + 라이트박스 미리보기(`AssetMediaLightbox` 재사용).
- `AssetGenWorkspace.tsx`: results `<main>` 우측에 레일 열 추가.
- `assetgen-workspace.css`: 레일 그리드 열(고정폭 ~96px, 세로 스크롤).
- i18n `assetGen.rail*` 키 (en/ko).

### B3 — 초보자 UX 개선 (opus-4-6 Erdos 리뷰 반영)

- Erdos(cxc-dev-uiux-design 적용 리뷰) P0 항목 반영: 카피 순화, 빈 상태
  다음 행동 명시, 생성 후 흐름 안내(키잉/저장 위치), 에셋 뷰어 온보딩.
- 범위는 P0 중심, P1은 판단 후 선별.

## 검증 (C)

- `npm run typecheck`, `cd ui && npm run build`
- 브라우저: #asset-gen 버튼 가독성 스크린샷, 생성 e2e(200 + 레일/그리드 반영),
  에러 배너 강제 재현(잘못된 모델 시나리오는 코드 수준 확인으로 대체 가능).
- ledger.jsonl 기록.

## 결과 요약

- 버그: 모델 클램프(`storeAssetGenImpl.assetGenModel` — 비GPT 전역 모델이면
  서버 기본값 fallback), 버튼 글자색 `--accent-ink`, 생성 실패 인라인 에러 배너.
- 레일: `AssetGenProjectRail` — 선택 프로젝트 에셋 세로 갤러리, 클릭 시 선택
  하이라이트 + 라이트박스, 새 에셋 등록 시 자동 갱신 (데스크톱 전용, 모바일 숨김).
- 초보자 UX: empty state CTA(프롬프트 포커스 / asset-gen 탭 이동), 자동 저장
  안내 스트립 + "에셋 탭에서 보기" 링크, 카피 순화(en/ko), Remove background
  버튼 강조, keying 슬라이더 "고급" 아코디언, assets 로드 에러 상태 + 재시도,
  폴더 삭제 확인 "삭제할까요?", 비-element 에셋 메타 상세 패널.
