# 000 — sprite-gen 차용(adoption) 분석 로드맵

## 출처와 전제

- 원본: [aldegad/sprite-gen](https://github.com/aldegad/sprite-gen) (Python CLI + Codex/Claude skill,
  v1.56.x 기준, 로컬 스냅샷 `/tmp/sprite-gen`, shallow clone 2026-07-15)
- 라이선스: **Apache-2.0** — 코드/아이디어 차용 가능. 코드 직접 이식 시 NOTICE
  고지 유지, 파생 파일에 출처 주석 남길 것.
- 분석 방법: 병렬 서브에이전트 3개(크로마 기술 / 생성 파이프라인 / 아틀라스·큐레이션 UX)
  read-only 분석. 산출물은 010/020/030에 file:line 근거와 함께 정리.

## sprite-gen이 하는 일 (한 줄)

기준 이미지 1장 + 액션 목록 → 상태(state)별 가로 스트립 생성 → 크로마 제거
(soft-alpha unmix) → connected-component 프레임 추출 → 큐레이션 웹뷰(선택) →
`sprite-sheet-alpha.png` + `manifest.json.frame_layout` 아틀라스.

## 총평 (파쿠리 가능 여부)

가능하다. 단 "전체 이식"이 아니라 세 층위로 나눠서:

1. **키잉 품질 기술** (010) — 지금 있는 colorKey.ts에 바로 얹는 개선. 가장 싸고 즉효.
2. **생성 제어 구조** (020) — recipe SSoT / 행 단위 잡 / idle-anchor identity 고정.
   provider 호출이 아니라 제어 구조가 sprite-gen의 진짜 차별점.
3. **스프라이트 모드 신설** (030) — frame_layout manifest, 큐레이터 UX, GIF QA.
   가장 크고, 060_home-presets/070_elements 이후에나 착수할 크기.

ima2-gen이 이미 더 잘하는 것도 확인됨: CbCr 키잉, 무채색 키 하드닝(031),
opaque-foreground despill(030), SSE 잡 라이프사이클, provider adapter. 이 부분은
sprite-gen을 따라가지 않는다.

## 문서 구성 (2026-07-15 WP1 docs 사이클에서 diff-level 잠금)

| 문서 | 주제 | 구현 사이클 |
|---|---|---|
| `001_wp1_docs_cycle_plan.md` | WP1 docs 사이클 계획 + audit fold-back | (완료) |
| `010_keying_softalpha_unmix.md` | soft-alpha unmix + trapped-spill despill (유채색 키) | WP2 |
| `040_cli_optimization.md` | CLI 표면: help 안전성/정합성, 모델 별칭, @last, 플래그 정렬 | WP3 |
| `050_cli_default_models.md` | 기본값: gen=luna, video=grok 1.5, imagine=quality + TS/JS 재생성 | WP4 |
| `020_sprite_recipe_identity_pipeline.md` | recipe SSoT + anchor 정책 + 행 단위 잡 (서버) | WP5 |
| `021_sprite_recipe_ui.md` | 스프라이트 recipe UI (assetgen 하위 탭) | WP5 |
| `030_atlas_manifest_curator_ux.md` | frame_layout manifest + run 스토리지 + compose/GIF (서버) | WP6 |
| `031_sprite_curator_ui.md` | 큐레이터 모달 + rAF 루프 프리뷰 + transform 규약 (UI) | WP6 |

## 구현 순서 (의존 순서, PHASE-SPLIT-01)

WP2(010, 독립) → WP3(040, CLI 표면) → WP4(050, 040이 정리한 표면 위에 기본값)
→ WP5(020+021, 생성 절반) → WP6(030+031, WP5 산출물을 소비하는 아틀라스 절반).

구현 공통 규칙: lib/bin TS 변경 시 `npm run build:server`/`build:cli`로 JS 재생성
후 같은 커밋에 포함. devlog는 `.gitignore`에 있으나 관례상 `git add -f`로 추적.

## Non-goals

- sprite-gen의 Python 코드 의존성 추가 (전부 TS 재구현)
- 독립 Python curator 서버 채택 (Express/React 제품 UX와 중복 — Dewey 분석 순위 9)
- codex/grok CLI 서브프로세스 provider 방식 (ima2-gen은 API adapter가 이미 우월)
