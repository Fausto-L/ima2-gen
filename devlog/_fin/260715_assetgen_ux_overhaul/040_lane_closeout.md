---
created: 2026-07-18
tags: [ima2-gen, assetgen, closeout]
status: CLOSED (2026-07-18)
---

# 040 — assetgen_ux_overhaul lane closeout

## 결정 기록 (사용자 결정, 2026-07-18)

`010_beginner_ux_fixes.md:3-6`이 다음 사이클로 미룬 **P1-1(폼 2단계 재구성)과
P2 전체를 폐기**한다. P2 항목은 레인 문서 어디에도 정의되지 않았고, 사용자가
후속 범위 없이 레인을 닫기로 결정했다. 폐기된 범위가 다시 필요해지면 새
레인으로 연다.

## 닫힌 범위

| 문서 | 결과 | 증거 |
|---|---|---|
| 010 beginner UX fixes | DONE (P0/P1 퀵윈), P1-1/P2 **폐기** | 본 문서 상단 결정 기록 |
| 020 lightbox remove-bg trigger | **ACCEPTED** (2026-07-18) | `033_acceptance_evidence.md` §4, `flow-1..5b`; element 미리보기 폴백 수정 `9777af2` |
| 030 chroma despill hardening | **ACCEPTED** (2026-07-18 사용자 시각 수용) | `033_acceptance_evidence.md` §3/§5/§7 — 프린지 육안 감소, green-dominant 1.65→0.00/1.07→0.01/1.29→0.07/2.53→0.20, 초록 눈동자·보석 보존 |
| 031 achromatic key hardening | 기술 완료 | `031:31-38`, color-key 13건 green |
| 032 keying click-to-erase | 기술 완료 | `032:10-27`, wand-erase 5건 green |

## 게이트 (2026-07-18)

npm test 1668/1668, typecheck + typecheck:tests, test:inventory, ui build 전부
green. focused 54+15건 green.

## 후속 주제로 남긴 것 (레인 밖)

- verify-chroma 배경 균일성 FAIL 3/4 (어두운 비네트 코너 — 생성
  프롬프트/프리셋 개선 아이디어, `033` §2). 별도 레인 후보.
- 검증 과정에서 저장된 `(keyed)` 파생 에셋 2건의 라이브러리 정리 (사용자 임의).
