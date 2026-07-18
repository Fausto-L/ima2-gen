# 060 — sprite-gen adoption closeout

상태: closeout (2026-07-18).

## 목표 회고

sprite-gen의 Python 런타임을 제품에 붙이지 않고, ima2-gen의 Express/React/TypeScript
구조 안에서 키잉 품질, CLI 표면과 기본값, sprite recipe/identity 생성 제어, atlas와
curator UX를 각각 소유 경계에 맞춰 이식했다. 기존 SSE async job 계약과 provider API
adapter를 유지한 채 sprite workflow를 AssetGen에 추가하는 것이 이 lane의 목표였다.

## 출하 WP 맵

| WP | 범위 | 출하 커밋 |
|---|---|---|
| WP2 | soft-alpha unmix/keying | `07d34f70` |
| WP3 | CLI 표면과 최적화 | `413a1ed5` |
| WP4 | 제품 기본값 | `ab9cd053` |
| WP5 | sprite recipe/identity pipeline + AssetGen UI | `57245b2c` |
| WP6 | atlas/manifest/curator | `8b37abb3` |

기본 image model을 `gpt-5.6-luna`로 맞춘 config default-model 변경은 defaults lane
후속 커밋 `dc5ee46`(2026-07-18)으로 출하됐다.

## 검증 증거

- 2026-07-18 focused sprite/soft-unmix/recipe/atlas/curator `node --test`: **40/40 pass**.
- 2026-07-18 전체 suite: **1665/1665 pass**. `npm run typecheck`,
  `npm run typecheck:tests`, `cd ui && npm run build`도 모두 green.
- Browser QA: 1440px에서 AssetGen workspace의 project rail, model picker,
  chroma-green background preset, prompt composer가 렌더됐다.
  증거 스크린샷: `assets/evidence-assetgen-workspace-1440.png`.
- 실제 sprite GENERATION은 provider API 호출이 필요하므로 browser QA 범위 밖이다.
  해당 UI surface는 추가로 source-contract tests가 고정한다.

## 계획 문서 정정

### A. i18n

`021_sprite_recipe_ui.md`의 en/ko/ja 요구와 `ja.json` 경로는 설계 시점 가정이었다.
2026-07-18 기준 앱에는 `ui/src/i18n/en.json`, `ui/src/i18n/ko.json`, `index.ts`만 있고
일본어 locale은 없다. Sprite/curator key는 en/ko에 존재하므로 이 lane의 실제 i18n
완료 기준은 en/ko parity다. ja locale 추가는 별도 제품 결정이며 본 lane 범위 밖이다.

### B. test matrix

계획서에 있던 분리 curator/playback/rail/lightbox 계약 파일은 구현 중
`tests/sprite-curator-ui-contract.test.js`로 통합됐다. 이 파일은 atlas rect/shared
transform, rail a11y, Lightbox metadata gate를 함께 검증한다. transform golden parity는
`tests/sprite-transform-contract.test.ts`가 계속 소유한다. Recipe UI도 실제
`tests/sprite-recipe-store.test.ts`, `tests/sprite-recipe-routes.test.ts`,
`tests/sprite-recipe-ui-contract.test.js` 매핑으로 정정했다.

## Non-goals와 잔여 메모

- remote sprite-gen runtime integration은 비목표다. `000_analysis_roadmap.md:53-57`의
  결정대로 sprite-gen Python 의존성이나 독립 Python curator 서버를 추가하지 않고,
  전부 TypeScript로 재구현한다.
- live provider-backed sprite generation은 API 비용/자격증명 의존 시나리오라 이번
  closeout의 browser QA 범위에 넣지 않았다. UI와 계약 경로는 focused tests로 고정했다.
- ja locale 도입은 이번 구현을 확장하지 않는다. 제품 차원의 locale 정책 결정 뒤 별도
  lane으로 다룬다.
