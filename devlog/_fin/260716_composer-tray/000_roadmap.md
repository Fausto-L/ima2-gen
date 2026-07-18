# 260716_composer-tray — 통합 참조 트레이 + 대형 프롬프트 컴포저

세션: 019f65ff-2065-7363-a253-09185ba7f06b · goalplan: mockup-a-d-d1-d2-d3-devlog-plan-260716-composer
근거: 인터뷰(.codexclaw/plan/unified-reference-tray-interview.md, 2라운드+Mind 스캔 11건) + 목업 확정
목업: ../260716_mcp-model-surface-ui/evidence/composer-mockups/{A-desktop-default,B-dead-tag,C-inflight-popup,D-mobile-sheet}.png — 유저가 A안 확정, 인플라이트는 우측 확장 팝업 확정.

## 확정 결정

- D1 통합 트레이: 직접 첨부 auto @Image_N + @element 멘션 태그, 단일 N+M 카운트 vs activeReferenceLimit.
- D2' 죽은 태그: 트레이 삭제 시 프롬프트 @태그는 유지, 회색/취소선 시각 표시만(payload 텍스트 불변).
- D3' 대형 컴포저: 사이드바 패널 ~70% 높이, 인플라이트는 Generate 옆 스피너+건수 배지 → 데스크톱 hover/클릭 시 **우측으로 펼쳐지는** 팝업, 모바일은 시트 내 인라인 스택(탭 토글).

## 데케이드 문서 (사이클당 1개 구현)

| 문서 | 범위 | 상태 |
|------|------|------|
| 010_tray-state-model.md | TrayItem 상태모델, 태그 고정, N+M 한도, 레인별 직렬화, temp-reference 업로드 엔드포인트 | sol 작성 중 |
| 020_desktop-layout-overlay.md | 70% 컴포저 레이아웃, 슬롯 트레이 UI, 죽은태그 mirror overlay | 작성 |
| 030_inflight-badge-popup.md | 스피너+건수 배지, 우측 확장 팝업, Sidebar InFlightList 대체 | sol 작성 중 |
| 040_mobile-sheet-qa.md | 86dvh 시트 재배치, 탭 토글, 통합 QA 매트릭스 | 작성 |

## 불변 조건

- 코어 레인 wire format 보존(refs data URL, elementIds), MCP 레인 references [{filename,tag}].
- 과금 생성 호출 금지. 병행 미커밋 파일(PromptComposer 등) 존중 — @멘션 배선/참조한도 미커밋분 위에 얹는다.
- 프리셋/프롬프트라이브러리 칩은 통합 대상 아님(참조류만).
