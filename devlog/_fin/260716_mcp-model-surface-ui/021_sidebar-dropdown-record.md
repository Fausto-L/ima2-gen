# 021 — 020 구현 기록 (WP2 사이클)

## Design Read (cxc-dev-uiux-design §2, 기록 의무)

- Page kind: tool UI — 다크 이미지 생성 스튜디오의 사이드바 유틸리티 컨트롤.
- Vibe: 기존 앱 언어 그대로(모노스페이스 pill, glass 패널, hairline). 새 미학 도입 없음 — Design System Detection 우선.
- Dials: DESIGN_VARIANCE 3 / MOTION_INTENSITY 2 (feedback-only 0.15s) / density D5.
- 스킨 결정: FE-DROPDOWN-LAYER-01 — 리포 로컬 primitive `controls/Select`(Phase 020 glass kit)를 단일 스킨으로 확장. hand-rolled 신규 드롭다운 금지 규칙 준수(기존 primitive 재사용이 해당 규칙의 허용 경로).

## 구현 델타

- `ui/src/components/controls/Select.tsx`: `groups`(그룹 헤더+구분선), `portal`(createPortal+fixed menuPos, scroll/resize 시 닫힘), outside-click menuRef 가드(R2-2), `triggerLabel`/`triggerSub`/`placeholder`/`title`, commit 시 trigger 포커스 복귀. 기존 flat `items` 소비자 하위호환.
- `ui/src/components/GenProviderModelSelect.tsx`: 네이티브 `<select>` 2개 제거(rg 0건) → `Select` 2개. 프로바이더 그룹(코어/연결 MCP/unavailable detached), 모델 그룹(MCP: unknown detached + image/video enum, higgsfield 잠금 항목; 코어: 모델 그룹 + GPT 계열 effort 그룹 + trigger sub로 현재 effort).
- `ui/src/styles/controls.css`: `.ctl-select__group*`, portal z-index. `ui/src/styles/canvas-accordion.css`: `.gen-provider-model` pill 스킨(인라인 width 제거, compact 클래스화).
- `tests/mcp-provider-ui-contract.test.js`: ctl-select 스킨/portal/가드 소스 계약 추가.

## 검증 증적

- typecheck/typecheck:tests exit 0, ui build 1.11s, npm test 1433 pass / 2 fail (baseline 2건 동일).
- 시각 검증(agbrowse, 3435): `assets-021/provider-groups-open.png`(CORE/CONNECTED MCP 그룹), `assets-021/runway-model-groups-open.png`(IMAGE 3 + VIDEO 6, seedance-2 노출), `assets-021/runway-seedance2-pill-closed.png`(닫힌 pill).
- 상태 계약 실측: seedance-2 클릭 → localStorage `{"mcpProvider":"runway","mcpModel":"seedance-2","mcpMediaKind":"video"}`; GPT 복귀 → `{"mcpProvider":null,"mcpMediaKind":"image","provider":"oauth"}`.

## 잔여

- 모바일 pill 라벨 절단(이월 항목, 000 참조)과 keyboard 경로의 실 브라우저 검증(Tab/화살표)은 030 스크린샷 라운드에서 함께 재확인.
