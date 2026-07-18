---
created: 2026-07-12
tags: [ima2-gen, presets, home, camera-controls, ux]
---

# 003 홈 진입면 + 프리셋 시스템

힉스필드 차별화의 핵심은 "전문 어휘를 비주얼 프리셋으로 대체"하는 것이다
(50+ 카메라 모션 프리셋: crash zoom, dolly, bullet time, FPV drone...).
ima2에는 이 언어 레이어가 통째로 없다. 이 문서가 이 레인에서 체감 변화가
가장 큰 P0다.

## 3-1. 홈 진입면

새 `#home` 워크스페이스. 구성은 서치 패턴 #3(프롬프트-퍼스트 홈) +
#13(blank/template/resume 3택):

- 상단: 큰 프롬프트 박스 하나 + Generate. 모델은 자동 선택(현재 기본
  프로바이더), 고급 옵션은 숨김.
- 중단: 프리셋 카드 그리드(아래 3-2). 카드 클릭 = 프롬프트에 프리셋 주입 +
  해당 모드로 이동.
- 하단: 최근 세션/최근 결과 이어가기 스트립(기존 `HistoryStrip` 재사용).

## 3-2. 프리셋 데이터 모델

```
preset = {
  id, name, category,        // camera-motion | style | vfx | lighting
  thumb,                     // 정지 썸네일 (필수)
  previewVideo?,             // hover 재생용 짧은 mp4/webm (선택)
  promptFragment,            // 모델 중립 서술
  perProvider?: {            // 프로바이더별 오버라이드
    grok?:   { fragment?, params? },   // 예: video 모션 파라미터
    gemini?: { fragment?, params? },
    gpt?:    { fragment? },
  },
  modes: ["image","video","edit"],
}
```

- **preset→prompt 컴파일러**: 선택된 프리셋들을 프로바이더에 맞는 프롬프트
  조각+파라미터로 컴파일하는 순수 함수(`lib/presetCompiler.ts`). 이게 ima2의
  Soul격 자산 — 힉스필드는 모델별 모션 지원을 자사 레이어로 흡수하는데,
  ima2도 같은 흡수를 프롬프트 컴파일로 한다.
- 시드 콘텐츠: 카메라 모션 ~20종(힉스필드 카탈로그에서 어휘 차용:
  crash zoom in/out, dolly in/out, dolly zoom, orbit, arc, crane, FPV,
  handheld, whip pan, bullet time, hyperlapse...), 스타일 ~15종, 조명 ~10종.
  JSON 시드 파일 + 사용자 정의 프리셋 저장(프롬프트 라이브러리와 같은 저장
  계층 재사용).
- 프리셋 미리보기 영상은 ima2 자체로 생성해서 동봉(도그푸딩. 라이선스 문제
  없는 자산 확보).

## 3-3. 컴포저 통합

- 선택된 프리셋은 컴포저에 **pill(칩)**로 표시 — 텍스트에 녹아 사라지지 않게.
  제거 = 칩 X. 프롬프트 본문과 프리셋 칩은 분리 저장, 생성 시점에 컴파일.
- `VideoControlsPanel`에 카메라 모션 칩 행 추가(007과 연동).
- XMP 메타데이터에 프리셋 id 기록 → 복원 시 칩까지 복원(008 리니지 연동).

## 검증

- 컴파일러 단위 테스트: 프리셋 조합 × 프로바이더 매트릭스 스냅샷.
- 동일 프리셋으로 Grok/Gemini 비디오 실생성 비교(수동 검수 1회).
- 프리셋 칩 저장/복원 계약 테스트.
