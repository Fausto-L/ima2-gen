# 031 — 030 구현 기록 (WP3 사이클)

## 구현 델타

- `ui/src/components/settings/ProviderStatusStrip.tsx` (NEW): 코어 6종(useProviderAvailability) + MCP(연결/경고/오류 dot, props 수신 — 부모 단일 폴러) 상태 스트립. Settings 탭 양쪽 분기 모두에서 첫 자식.
- `ui/src/components/settings/McpGenerationControls.tsx` (NEW): RUNWAY · MCP 헤더 + "코어 프로바이더 사용" 이탈 링크, Image|Video kind 토글(setMcpMediaKindImpl), kind별 MODEL 그리드(getMcpModelCatalog), ASPECT RATIO Auto+프리셋 3종(setMcpRatioImpl), Higgsfield 잠금 안내, 미연결 안내.
- `ui/src/components/GenerationControlsPanel.tsx`: mcpProvider 활성 시 MCP 분기 렌더(코어 컨트롤 미렌더), useMcpProviders 1회 호출 후 props 전달.
- `ui/src/components/ProviderSelect.tsx`: `muteSelection` — MCP 활성 중 코어 pill selected 해제(동시 활성 금지, 감사 blocker 6).
- `mcpRatio` 수명(R3-1 완결): storeTypes(GenerationDefaults+상태), storePersistence(whitelist normalize), storeSettingsImpl(setMcpRatioImpl, clearMcpLane 저장값 null 패치, hydrate 복원), `buildMcpGenerationInput`이 ratio 소유(Auto=키 생략, R4-1) — 010의 kind별 파생 제거.
- i18n: mcp.exitLane / mcp.modelSectionTitle / mcp.ratioAutoHelp (en/ko).
- 스타일: right-panel.css strip/MCP 섹션, status-dot--warn.

## 검증 증적

- typecheck/typecheck:tests exit 0, ui build 960ms, npm test **1436 pass / 2 fail** (baseline 2건 동일), focused 27/27.
- 시각 검증(agbrowse, 3435): `assets-021/settings-panel-runway-mcp.png` — status strip 최상단(GPT~Higgsfield dot), muted 코어 그리드, RUNWAY·MCP 섹션(Video 토글 active, video 모델 6종 그리드에서 seedance-2 active, ratio 16:9 active). `assets-021/settings-status-strip-core.png` — 코어 상태 strip.
- 상태 실측: Video 토글→모델 그리드가 video 6종으로 전환, seedance-2+16:9 클릭 → localStorage `{"mcpProvider":"runway","mcpModel":"seedance-2","mcpMediaKind":"video","mcpRatio":"16:9"}`.

## 잔여 (이월)

- MCP typed 오류 code별 사유 노출(현행 일반 토스트), 모바일 pill 라벨 절단, Provider union 확장, routes/video.ts capability guard — 000/선행 유닛 이월 목록과 동일.
- Runway 실 video 생성 smoke는 과금이라 이번 사이클 비실행(payload 계약은 순수 테스트로 검증). 사용자 승인 시 최소 1건 실행 가능.
