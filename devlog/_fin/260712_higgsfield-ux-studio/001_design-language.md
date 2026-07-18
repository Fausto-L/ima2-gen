---
created: 2026-07-12
tags: [ima2-gen, design-tokens, rebrand, ui]
---

# 001 디자인 언어 — 사이트 질감의 앱 이식

사이트 리브랜딩은 끝났고, 앱 UI가 아직 이전 세대(무채색 그레이스케일 +
Outfit/Geist Mono)에 머물러 있다. 이 문서는 `site/src/styles/global.css`의
완성된 언어를 `ui/src/index.css` 토큰 체계로 옮기는 작업을 정의한다.

## 현재 격차

| 항목 | 사이트 (기준점) | 앱 UI (현재) |
|---|---|---|
| 배경 | `#0b0b0f` + 듀얼 radial glow + 노이즈 오버레이(op .026) | `#0a0a0a` 플랫 |
| 패널 | 글래스(`rgba(255,255,255,.04)` + blur 14px) | 불투명 `#141414` |
| 악센트 | 프리즘 그라데이션(핑크→시안→골드→바이올렛) + 크롬 텍스트 | 흰색 단색 |
| 디스플레이 서체 | Clash Display | 없음 (Outfit 단일) |
| 본문 서체 | Satoshi + Pretendard | Outfit |
| 모노 | IBM Plex Mono | Geist Mono |
| 마이크로 인터랙션 | foil-hover(프리즘 테두리), prism-pan 애니메이션 | 밝기 변화만 |
| 레이블 문법 | mono 11px uppercase letter-spacing .16em eyebrow | 일반 라벨 |

## 작업 항목

1. **토큰 이식**: `--bg #0b0b0f`, `--panel`, `--line #26262f`, `--glass`,
   `--glass-line`, `--prism`, `--chrome`를 `ui/src/index.css` `:root`에 추가.
   기존 `--surface`/`--border` 소비처는 유지하되 값을 사이트 팔레트로 갱신 —
   토큰 이름 대량 교체는 하지 않는다(회귀 범위 최소화).
2. **노이즈/글로우 레이어**: body `::before`/`::after` 패턴을 앱 셸 루트에
   이식. 노드 캔버스/이미지 뷰어 위에서는 끈다(순수 검정 유지 — 미디어 검수
   방해 금지).
3. **서체**: Clash Display(패널 타이틀·빈 상태·숫자 강조 한정),
   Satoshi/Pretendard(본문), IBM Plex Mono(메타데이터·비용·상태 칩).
   폰트는 사이트와 동일 소스 self-host. 한글 fallback은 Pretendard Variable.
4. **프리즘 사용 규칙**: 프리즘은 "생성이 일어나는 순간"에만 —
   Generate 버튼 활성/hover, 진행 중 잡 표시, 완료 플래시. 상시 장식 금지.
   나머지 크롬은 사이트처럼 무채색 유지(미디어-퍼스트 원칙).
5. **글래스 패널**: RightPanel, 모달, 팝오버, 토스트에 `.glass-panel` 등가
   적용. 스크롤 성능 확인 후 blur 반경 조정(모바일은 blur 축소 또는 불투명
   fallback).
6. **테마 단일화** (2026-07-12 결정): 다크 단일. `data-theme="light"` 블록과
   `ThemeToggle`을 제거한다. 사이트와 동일하게 팔레트 하나만 유지 —
   상세는 phase `010_design-tokens.md`.

## 검증

- `cd ui && npm run build` 통과, 기존 CSS 계약 테스트 무회귀.
- 클래식/노드/에이전트/설정 4면 스크린샷 비교.
- 노이즈·blur 추가 후 갤러리 스크롤 60fps 유지(DevTools 성능 프로파일).
