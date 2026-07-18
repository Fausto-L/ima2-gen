---
created: 2026-07-18
tags: [ima2-gen, assetgen, keying, acceptance, evidence, needs-human]
status: ACCEPTED (2026-07-18 사용자 시각 수용)
---

# 033 — 020/030 수용 증거 패키지

`000_current_status.md`의 사람 수용 절차를 자동화 가능한 범위까지 실행한
기록. 자동 게이트·정량 지표·UI 동선 캡처는 모두 모았고, 남은 것은 사람
시각 판정(체크리스트 2~4번)뿐이다. 증거 파일은 전부
`assets-acceptance/`에 있다.

## 1. 대표 에셋 (전부 실제 생성된 모에화 chroma-green)

| 역할 | asset ID | 원본 파일 | 프롬프트 | keying 설정 |
|---|---|---|---|---|
| (a) 가는 머리칼/복잡 외곽 | `a_01KXK896XCWG8HVYB1FWD3YW3W` | `1784131394336_776db756_0.png` | "자신을 모에화 한 지피짱 그려줘 흰색 배경이니까 색은다르게" (backgroundPreset=chroma-green, oauth) | tolerance 40 / softness 10 / spill 0↔50 |
| (b-보조) 긴 웨이브 머리 | `a_01KXK895TVZYG7YHHRJD30W75C` | `1784131393219_6b239780_0.png` | 동일 (chroma-green, oauth) | 동일 |
| (b) 초록 눈동자+보석 | 이번 실행에서 생성 (`gen-accept-green-eye`) | `1784370805713_326926dd_0.png` | "moe anime style character portrait of a girl with long silver hair and striking emerald green eyes, wearing a green gemstone pendant, centered, clean solid chroma green background, asset shot" (POST /api/generate, backgroundPreset=chroma-green) | 동일 |
| (c) 일반 외곽 대조군 | `a_01KXJ5G8H2TDJJNQ82A90J9ABE` | `1784094925207_708995f4_0.png` | "자신을 모에화한 지피티의 모습" (chroma-green, oauth) | 동일 |

기존 라이브러리에는 초록 눈동자/보석 피사체가 없어(후보 3장 모두 파란 눈)
(b) 전용 1장만 새로 생성했다(생성 예산 3장 중 1장 사용).

## 2. 자동 게이트 (verify-chroma)

| 원본 | 결과 | 수치 |
|---|---|---|
| (a) 1784131394336 | **PASS** | green-dominant 8/8, avg [5,234,16], drift 0 |
| (b-보조) 1784131393219 | FAIL | 7/8, avg [9,214,13] |
| (b) 1784370805713 | FAIL | 7/8, avg [32,210,39] |
| (c) 1784094925207 | FAIL | 7/8, avg [33,246,41] |

발견(기록): 실제 생성물 4장 중 3장이 가장자리 8점 균일성 게이트(95%)를
7/8로 통과하지 못한다. 어두운 비네트 코너가 원인으로 보이며, 생성
프롬프트/프리셋의 배경 균일성 개선은 별도 후속 주제다. 이 FAIL은 키잉
품질 판정 자체를 막지는 않지만(키잉은 tolerance 기반으로 정상 동작),
게이트 결과는 있는 그대로 남긴다.

## 3. 정량 지표 — spill ablation

주의: "before"는 역사적 하드닝-이전 바이너리가 남아 있지 않아 **같은
빌드에서 despill 단계만 끈(spill:0) ablation**이다. `000` §1.3에 따라
"하드닝 전 대비 감소"가 아니라 "동일 입력에서 despill 단계의 측정 효과"로
읽어야 한다. 스크립트: `assets-acceptance/green-ratio.mjs`(A-감사에서 메트릭
구현 정확성과 재계산 일치를 검증받음).

| 에셋 | keyColor | before(spill 0) | after(spill 50) |
|---|---|---|---|
| (a) fine-hair | rgb(5,236,17) | 1.65% (6154/373465) | **0.00%** (8/373465) |
| (b-보조) long-wavy | rgb(9,245,13) | 1.07% (6616/620478) | **0.01%** (43/620478) |
| (b) green-eyes-jewel | rgb(7,212,14) | 1.29% (12491/967919) | **0.07%** (664/967919) |
| (c) control | rgb(5,248,14) | 2.53% (18840/744494) | **0.20%** (1523/744494) |

alpha>0 픽셀의 green-dominant(`g > max(r,b)+24`) 비율은 despill 단계에서
모든 에셋에서 감소한다. (b)의 잔여 664px는 실제 초록 눈동자/펜던트일
가능성이 있으며, 보존 여부는 사람 판정 대상이다.

## 4. UI 동선 캡처 (020)

| 캡처 | 내용 | 결과 |
|---|---|---|
| `flow-1-lightbox-remove-bg-button.png` | asset-gen 레일 확대 → 라이트박스 하단 "배경 제거" 버튼 | 버튼 존재 |
| `flow-2-keying-panel.png` | 같은 에셋으로 KeyingPanel 오픈(원본+키잉 결과, 슬라이더) | 동일 에셋 진입 |
| `flow-3-after-save-assets-refresh.png` | "프로젝트에 저장됨" + 목록에 `(keyed)` 결과 반영 | 저장·갱신 확인 |
| `flow-4-keyed-no-button.png` | kind=edit 에셋 라이트박스에 버튼 없음 | 부재 확인 |
| `flow-5-assets-tab-no-button-gap.png` | **GAP 발견** — 아래 참조 | — |

재현: `node assets-acceptance/capture-020-flow.mjs` (멱등 — 소스 타일만
선택). 콘솔 로그: `capture-020-console.log`.

### GAP 해소 기록 (2026-07-18 수정 완료)

초기 실측(`flow-5`)에서 `#assets` 미리보기에 버튼이 없어 020:31-32 미충족으로
기록했으나, 정밀 검증에서 두 사실이 분리됐다.

1. **일반 image 에셋의 assets 탭 미리보기는 원래 정상**이다. 버튼이 안 뜬
   캡처는 선택자가 ELEMENT 타일을 집은 artifact였다. 정상 증거:
   `flow-5a-assets-tab-button.png` (keybtn 렌더 확인).
2. **진짜 버그는 element 에셋 미리보기 붕괴**: promote-to-element로 만든
   element는 `filePath: null`이라 `assetToPreviewItem`이 빈 경로를 만들어
   `/generated/`(깨진 이미지) + `canKey` false가 됐다.
   `ui/src/lib/assetPreview.ts`가 `elementPreviewPath`(metadata.refs[0])로
   폴백하도록 수정(그리드 썸네일 수정과 동일 규칙). 검증:
   `flow-5b-element-preview-fixed.png`(이미지+버튼 렌더),
   `tests/asset-preview-element-fallback.test.ts` 3/3.

## 5. 전후 비교 캡처 (030, 같은 크롭 340×340)

| 쌍 | 부위 |
|---|---|
| `zoom-hair-before/after.png` | (a) 머리칼 경계 |
| `zoom-eyes-before/after.png` | (b) 초록 눈동자·펜던트 |
| `zoom-outline-before/after.png` | (c) 의상/외곽 |
| `*-before.png` / `*-after.png` (에셋별 전체) | 전체 프레임 비교 |

## 6. 게이트 로그 (2026-07-18 재실행)

- `gate-npm-test.log` — npm test 1665/1665, exit 0
- `gate-typecheck.log` — typecheck + typecheck:tests, exit 0
- `gate-ui-build.log` — vite build ✓, exit 0
- focused 54/54 (asset-derived/background-presets/color-key/wand-erase/
  video-chroma-key/keying-preview/media-lightbox)

## 7. 사람 체크리스트 — **ACCEPTED (2026-07-18, 사용자 시각 수용)**

- [x] `npm test`(color-key 포함), typecheck, UI build clean — §6 로그
- [x] 실제 모에화 에셋 재키잉에서 머리 경계의 초록 프린지가 **육안으로** 감소 — 사용자가 `zoom-hair` 등 쌍을 확인하고 수용 (2026-07-18 "거의 패스해도 될 듯")
- [x] alpha>0 green-dominant 비율 감소 — §3 정량 + ablation 프레이밍 사용자 수용 (2026-07-18)
- [x] 초록 눈동자/보석 보존이 스크린샷으로 확인 — 사용자가 `zoom-eyes` 쌍을 확인하고 수용 (2026-07-18)

사용자 수용은 이 스레드의 구두 확인(2026-07-18)을 근거로 기록한다.

부수 효과 기록: 동선 검증 중 "Save to project"가 실제 실행되어 `(keyed)`
파생 에셋이 프로젝트에 2건 저장되어 있다. 수용 판정 후 삭제필 여부를
결정하면 된다.
