# 090 — composer-tray lane closeout ledger

## Lane objective recap

`000_roadmap.md`의 확정 범위는 통합 참조 트레이와 대형 프롬프트 컴포저다. 직접 첨부와 `@element`를 하나의 트레이/한도 아래 두고, 트레이에서 제거한 태그의 payload는 바꾸지 않되 죽은 태그로 시각화한다. 데스크톱은 대형 컴포저와 우측 확장 인플라이트 팝업, 모바일은 86dvh 시트 안의 인라인 인플라이트를 제공한다.

후속 사용자 관찰로 Element Library 진입점, gallery 별표의 Assets 입장/독립 해제, 그리고 결과 프레임·Assets 카드의 직접 별표 제어를 같은 lane에 닫았다. 코어 레인 wire format(`refs` data URL, `elementIds`)과 MCP `references: [{filename,tag}]` 계약은 유지했고, 과금 생성 호출은 하지 않았다.

## Phase completion map

| Phase | 완료 범위 | 문서·브라우저 증거 |
|---|---|---|
| 010 | 통합 `TrayItem` 상태 모델, frozen tag, N+M 한도, 레인별 serializer와 MCP temp-reference 계약을 정리했다. | `010_tray-state-model.md` (state/serializer/test contract; 이 phase의 별도 PNG 없음) |
| 020 | 데스크톱 대형 composer, reference tray, 죽은 태그 하이라이트/mirror를 적용했다. | `020_desktop-layout-overlay.md`, `evidence-020-desktop-deadtag.png` |
| 030 | Generate 옆 인플라이트 badge와 우측 확장 popup/모바일 인라인 계약을 적용했다. | `030_inflight-badge-popup.md`, `evidence-030-badge-popup.png` |
| 040 | 86dvh 모바일 compose sheet, read-only Home reference strip, 모바일 레이어·터치·dead-tag QA를 닫았다. | `040_mobile-sheet-qa.md`, `evidence-040-mobile-tray.png`, `evidence-040-mobile-deadtag.png`, `evidence-040-mobile-inflight.png`, `evidence-040-mobile-320.png`, `evidence-040-home-reference-strip.png`, `evidence-040-mobile-ko.png` |
| 050 | attachment `@` 멘션 재삽입과 tray limit toast parity를 적용하고 브라우저 시나리오를 기록했다. | `050_attachment-mention-parity.md`, `051_wp5-qa-notes.md`, `evidence-050-mention-menu.png`, `evidence-050-tag-reinserted.png`, `evidence-050-limit-toast.png` |
| 060 | Assets sidebar의 Element Library top-level 진입점과 element-scoped empty state를 적용했다. | `060_element-library-entry.md`, `evidence-060-element-library.png` |
| 070 | gallery favorite ON 시 Assets 입장, OFF/삭제의 독립성, Assets 이름 변경 계약을 적용했다. | `070_star-to-assets-rename.md`, `evidence-070-star-on.png`, `evidence-070-rename.png` |
| 080 | gallery/result/Assets 세 표면의 별표 접근성·상태 소유권을 공통 제어로 통일했다. | `080_star-controls-result-assets.md`, `assets-080/evidence-080-desktop-1440-result-star.png`, `assets-080/evidence-080-mobile-500-result.png`, `assets-080/evidence-080-mobile-500-assets-star.png` |

## 080 implementation and verification record — 2026-07-18

- Commit: `32235ab` — `feat(composer-tray): 080 star controls — result/Assets shared favorite surface`.
- New shared surface: `ui/src/components/controls/FavoriteStarButton.tsx`, `ui/src/lib/favoriteState.ts`, `ui/src/styles/favorite-star.css`, `tests/star-surface-controls-contract.test.ts`.
- Connected owners: `Canvas`, `GalleryImageTile`, `GalleryModal`, `controls/index`, `main.tsx`, `storeAssetsImpl`, `storePromptImpl`, `storeTypes`, and en/ko star keys. Gallery favorite CSS ownership moved from `prompt-library-extras.css` into `favorite-star.css`.

### Audited behavior evidence

- Result frame resolves pressed state from matching live history first, then falls back to `galleryFavorites`; it has a per-file pending guard (`ui/src/components/Canvas.tsx:136-145,183-188,223-230`). This prevents a stale `currentImage.isFavorite` from overriding a live OFF state and suppresses double toggles.
- Assets starring is owned by `asset.tags`, awaits the update, and does not optimistically mutate local state (`ui/src/components/assets/AssetsGrid.tsx:46-57,68-74`). OFF removes only `starred`; gallery favorite remains independent.
- The shared button provides `aria-pressed`, busy/disabled state, native Enter/Space activation, and pointer/click/double-click/key event isolation (`FavoriteStarButton.tsx:18-46`).
- CSS places result-frame stars at top-right, Assets stars at top-left, and promotes coarse-pointer targets to 44px (`favorite-star.css:56-76`).

### Verification gates

- Focused contracts: `star-surface-controls` 7/7, `assets-star-rename` 9/9, `composer-mention-parity` 5/5 pass.
- Full suite: 1665/1665 pass.
- `npm run typecheck`, `npm run typecheck:tests`, `npm run test:inventory`, and `cd ui && npm run build` all green.
- All listed gates were recorded green on 2026-07-18.

### Browser QA evidence

- `assets-080/evidence-080-desktop-1440-result-star.png` — local server `:3333`, agbrowse, 1440 desktop result-frame star.
- `assets-080/evidence-080-mobile-500-result.png` — mobile-class 500px result-frame star.
- `assets-080/evidence-080-mobile-500-assets-star.png` — mobile-class 500px Assets card stars with filled/unfilled state visible.

The intended 390px mobile capture was substituted with 500px because headless Chrome window bounds enforced a larger minimum. This is a viewport substitution, not a claim that 390px was captured.

`assets-080/evidence-080-desktop-1440-assets-star.png` predates the confirmed 080 closeout set and, despite its filename, was captured at a smaller viewport. It is superseded and is not used as evidence for a 1440px Assets-card assertion.

## Residual notes

- Source-contract tests prove ownership, propagation, accessibility, and state-transition contracts; they do not replace live browser interaction. The 080 browser screenshot set supplies the visual/live-surface QA record for this closure.
- No open blockers remain for the composer-tray lane.
