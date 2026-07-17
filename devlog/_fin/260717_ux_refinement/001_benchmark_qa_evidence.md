---
created: 2026-07-17
tags: [ima2-gen, ux, benchmark, evidence]
---

# 001 — 벤치마크 실사 + 자체 QA 증거 (2026-07-17)

Chrome(로그인 세션)으로 Higgsfield/Runway를 실사하고, 같은 브라우저에서
로컬 서버(127.0.0.1:3333)를 데스크톱(기본 뷰포트)과 모바일(390×844 override)로 QA했다.
스크린샷은 `assets/`에 저장.

증거 등급: `assets/bench-higgsfield-assets.png`, `assets/bench-runway-assets.png`로 뒷받침되는 Assets 섹션 관찰은 **verified**. 모델 피커·비디오 폼·Duration 팝오버·Apps 드롭다운 관찰은 세션 중 실시간 스크린샷으로 확인했으나 파일로 저장하지 않았으므로 **관찰 메모(unverified)** 등급이다 — 구현 phase가 이 패턴을 결정 근거로 쓸 때는 해당 화면을 재방문해 캡처를 남기거나 메모 등급임을 인용에 명시한다.

## Higgsfield 패턴 (관찰)

| 표면 | 패턴 | ima2 시사점 |
|---|---|---|
| 모델 피커 | 검색 입력 + "Featured models" 그룹 + 모델별 1줄 설명 + NEW 배지 | `GenProviderModelSelect` 그룹 드롭다운에 모델 설명/배지 슬롯이 없음. 040에서 옵션 서브텍스트 계약 고려(단, WT 충돌로 셀렉터 본체는 이월 가능) |
| Image 랜딩 | 히어로 + 인라인 컴포저(+ 첨부, 모델 칩, 비율 칩, Generate) | 홈 컴포저(`HomePromptComposer`)와 유사. 결함 없음 확인만 |
| 비율 선택 | 칩 → 세로 팝오버 리스트(아이콘+체크) | ima2 `1:1` 버튼과 유사 밀도. 참고만 |
| Video 폼 | 좌측 고정 패널: 미디어 업로드 → 프롬프트(@ 안내 문구 포함) → Elements/오디오 토글 → 모델 행(chevron) → 8s/Auto/1080p 칩 → Generate에 크레딧 병기 | duration/resolution 칩+병기 크레딧은 ima2 video 컨트롤 폴리시 참고. "Use @ to reference assets" 플레이스홀더 카피가 유용 |
| Video 온보딩 | 본문에 ADD IMAGE → CHOOSE PRESET → GET VIDEO 3-step 카드 | ima2 node/video 빈 상태 온보딩 참고 (080 WT라 이월) |
| Assets | 좌측 폴더 트리(All/Favorites 고정 + Tools 그룹 + 사용자 폴더+추가 버튼), 빈 상태 = 일러스트+“Your generations will appear here”+서브카피+Generate CTA | 060: ima2 Element Library 빈 상태 CTA 보강(HEAD에 CTA 자체는 이미 존재 — A 감사 정정), 폴더 트리 모바일 CRUD 복원 |
| 마케팅 모달 | 진입마다 오퍼/기능 모달 2회 | 반면교사 — 도입하지 않음 |

## Runway 패턴 (관찰)

| 표면 | 패턴 | ima2 시사점 |
|---|---|---|
| 모드 전환 | 상단 Image/Video/Audio 세그먼트 + Multi-reference/Keyframe 서브탭 | ima2 Image/Video 토글과 동형. 참고만 |
| 모델 피커 | 하단 칩 → 검색 + Recent/Featured/벤더 필터 칩 + 모델명 옆 capability 요약("Multi-modal control", "Keyframes, Multishot, References, Audio") | 040 참고. 모델 설명 텍스트의 가치 확인 |
| Duration | 칩 → 팝오버 슬라이더(4s~15s min/max 라벨 + 수치 입력) | ima2 `DurationSlider`와 동형. min/max 라벨 병기 참고 |
| 설정 칩 행 | 오디오 On/비율/해상도/시간/시드 아이콘 칩 한 줄 | ima2 컴포저 하단 칩 행과 동형 |
| Apps | "Apps" 드롭다운: 썸네일 + 제목 + 1줄 설명 리스트 | 참고만 |
| Assets | 날짜 그룹 그리드 + All media/Favorites/Tags 필터 + 밀도(Compact) 토글 + All Assets 버튼 | 060 참고: 폴더 없는 대신 필터+날짜 그룹. ima2는 폴더 트리 유지가 낫다(이미 구현) |
| 참조 슬롯 | Multi-reference 탭: Reference 슬롯 3개 + 안내문 + See Guide 링크 | MCP reference slots(WT 충돌로 구현 이월)의 목표 상태 근거 |

## 자체 QA 발견 (라이브 재현)

| # | 심각도 | 발견 | 스크린샷 | 코드 근거 |
|---|---|---|---|---|
| Q1 | High | 홈 네비 버튼 tooltip/aria가 raw key `nav.home` 노출 (다른 6개 버튼은 정상) | `qa-desktop-home.png`(정상 진입 자체는 됨), DOM 검사 로그 | `NavRail.tsx:121` `labelKey:"nav.home"`; en/ko i18n에 `nav.home` 키 부재 (`rg '"nav\.'` 결과 flat-key 파일에 없음 — flat 구조 확인 필요) |
| Q2 | High | Assets 필터바에 raw key `assets.clearAll`이 버튼 텍스트로 노출 | `qa-local-assets-clearall-rawkey.png`, `qa-mobile-assets.png` | `AssetsWorkspace.tsx:77` `t("assets.clearAll")`; `en.json:1764`에 키 존재 — t() 네임스페이스/중첩 해석 불일치 조사 필요 |
| Q3 | Medium | 모바일(390px) Assets: 폴더 행이 상단 가로 칩으로 변하고 새 폴더 추가/rename/delete 진입점 소실 | `qa-mobile-assets.png` | `assets-workspace.css:79-89` |
| Q4 | Low | 모바일 컴포저 시트는 열림/탭/닫기 동작 자체는 정상. 단 코드상 focus 계약 부재 (002 #1) | `qa-mobile-compose-sheet.png` | `MobileComposeSheet.tsx:64-83` |
| Q5 | Info | 멘션 메뉴(@) 데스크톱 정상 표시(Jipy/Character) | `qa-desktop-mention-menu.png` | — |
| Q6 | Info | provider 드롭다운 그룹핑(CORE PROVIDERS + Runway Unavailable) 정상 | `qa-desktop-provider-dropdown.png` | — |

주: Q1/Q2는 병렬 세션이 en/ko를 수정 중(스킬 참조 문서 diff)이지만, 이 결함은 **키 부재/해석 실패**로 HEAD에서도 재현되는 라이브 노출 결함이라 010에서 키 추가로 처리한다(키 추가는 충돌 정책 허용 범위).
