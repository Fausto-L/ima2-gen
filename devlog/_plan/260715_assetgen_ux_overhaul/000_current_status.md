---
created: 2026-07-18
updated: 2026-07-18
tags: [ima2-gen, assetgen, keying, closeout, needs-human]
status: NEEDS_HUMAN
---

# Asset-gen UX overhaul — 현재 상태 + 재개 가이드

## 현재 상태

레인은 코드·자동 검증 관점에서는 keying/click-erase까지 반영되어 있지만, 전체
closeout은 아직 할 수 없다. `030`의 실제 모에화 에셋 시각 수용과 `020`의
라이트박스 진입·저장 후 갱신 수용 증거가 사람 판단으로 남아 있다. 또한 `010`이
DONE으로 표기되어도 P1-1과 P2는 구현 백로그가 아니다. `010` 본문이 P1-1(폼
2단계 재구성)과 P2 전체를 다음 사이클로 미뤘고(`010_beginner_ux_fixes.md:3-6`),
이 레인의 다섯 문서에는 P2 항목 정의가 없다. 두 범위는 인터뷰/사용자 결정으로
정의한 뒤에만 구현한다.

| 문서 | 상태 | 증거 | 커밋/자동 검증 |
|---|---|---|---|
| `010_beginner_ux_fixes.md` | 문서상 **DONE**, 후속 범위 **미정** | B1/B2와 B3 P0·P1 퀵윈은 완료로 기록됐지만 P1-1·P2 전체를 명시적으로 이연 (`010:3-6`) | base UI `57245b2c` (AssetGenWorkspace), asset-gen 배선 `730e61c`; P1-1/P2는 범위 정의 전 구현 금지 |
| `020_lightbox_remove_bg_trigger.md` | 구현 완료, **NEEDS_HUMAN** | 라이트박스→KeyingPanel 및 저장 후 목록 갱신의 스크린샷이 수용 기준 (`020:28-33`) | base UI `8b37abb3` (AssetMediaLightbox), keying/asset-gen 배선 `730e61c`; media-lightbox 계약 7건 green |
| `030_chroma_despill_hardening.md` | 구현·자동 검증 완료, **NEEDS_HUMAN** | 실제 모에화 에셋에서 프린지 감소, alpha>0의 green-dominant 비율 감소, 눈/보석 보존이 수용 기준 (`030:50-56`) | `730e61c`; color-key 13건, background-presets 10건 green |
| `031_achromatic_key_hardening.md` | 기술 완료 | 흰/검 키에서 피부·내부 하이라이트·유색 피사체 보존 회귀 3건과 64×64 시뮬레이션 기록 (`031:31-38`) | `730e61c`의 `colorKey.ts`; color-key 13건 green |
| `032_keying_click_to_erase.md` | 기술 완료 | SOURCE 기준 flood-fill, 시드 누적/취소, 이미지 저장·다운로드 반영 (`032:10-27`) | `730e61c`의 `wandErase.ts` 및 KeyingPanel 배선; wand-erase 5건, keying-preview 계약 7건 green |

공통 구현 묶음은 `730e61c`에 `colorKey.ts`, `wandErase.ts`, 배경 preset·비디오
chroma 경로, `assetDerived`/`videoKeying` route, `verify-chroma.mjs`, asset-gen
컴포넌트와 SSE/API 배선을 포함한다. KeyingPanel은 `07d34f70`, workspace는
`57245b2c`, lightbox는 `8b37abb3`에 이미 HEAD로 반영되어 있다. 2026-07-18
closeout-sweep도 이 레인을 `KEEP ACTIVE (NEEDS_HUMAN)`으로 분류했다
(`../260718_closeout-sweep/000_audit.md:28`).

## 사람 수용 절차

### 1. 대표 에셋을 고정한다

1. 실제 생성된 **모에화 chroma-green 에셋**만 선정한다. synthetic fixture,
   단색 도형, 다른 프로젝트의 기존 PNG는 수용 근거가 될 수 없다.
2. 최소 세 장을 기록한다: (a) 가는 머리카락/복잡한 외곽선, (b) 초록 눈동자 또는
   초록 보석이 있는 피사체, (c) 일반 외곽선 대조군. 각 항목의 asset ID, 원본 파일,
   생성 프롬프트와 keying 설정(tolerance/softness/spill)을 함께 기록한다.
3. 가능하면 동일한 원본과 설정으로 하드닝 전/후 결과를 준비한다. 전 결과를 다시
   만들 수 없다면 그 사실을 기록하고, 동일 원본의 현재 결과에 대해 사람 보존 판정을
   수행한다. 이 경우에는 “비율 감소”를 완료라고 주장하지 않는다.

### 2. 생성 배경과 알파 자동 게이트를 먼저 통과시킨다

원본 chroma PNG 또는 MP4에는 아래처럼 실행한다. 이 검사는 테두리 여덟 점의
green dominance와 비디오 프레임 간 색 드리프트를 확인하며, PASS 기준은 95%와
dRGB 15 이하이다 (`scripts/verify-chroma.mjs:5-12`, `:72-85`).

```bash
npm run verify:chroma -- <원본-chroma.png>
npm run verify:chroma -- <원본-chroma.mp4>
```

알파 WebM을 저장한 비디오 결과는 별도로 디코드 알파를 확인한다.

```bash
npm run verify:chroma -- <키잉-결과.webm> --alpha
```

`verify-chroma` PASS는 배경 균일성/알파의 자동 게이트일 뿐이다. alpha>0 전경의
green-dominant 비율이나 눈·보석 같은 피사체 보존은 이 스크립트가 측정하거나
판정하지 않으므로, 다음 사람 수용을 대체하지 않는다.

### 3. 라이트박스 동선과 저장 갱신을 캡처한다

각 대표 에셋에서 다음 순서와 화면을 남긴다.

1. asset-gen 레일 또는 결과 그리드에서 확대하고, 라이트박스 하단의 **배경 제거**
   버튼이 보이는 화면을 캡처한다.
2. 버튼을 눌러 같은 asset ID가 대상인 KeyingPanel이 열린 화면을 캡처한다.
3. 키잉 후 **Save to project**를 실행하고, assets 탭 목록에 새 키잉 결과가 갱신된
   화면을 캡처한다.
4. `kind=edit`인 이미 키잉된 에셋에서는 해당 버튼이 없는 화면도 하나 캡처한다.

이는 `020`의 두 진입점과 post-save refresh 수용 기준(`020:28-33`)을 직접
증명한다.

### 4. 전후 품질을 사람 눈으로 비교한다

각 대표 에셋에 대해 같은 확대 배율의 before/after 쌍을 캡처한다. 머리카락 경계,
어깨·의상 외곽, 초록 눈동자/보석을 각각 확대해 보이게 하고, alpha>0 픽셀의
`g > max(r,b)+24` 비율을 전/후로 기록한다. 정량 수치만으로 통과시키지 말고,
아래 체크리스트를 모두 확인한다.

- [ ] `npm test`(color-key 포함), typecheck, UI build가 clean이다.
- [ ] 실제 모에화 에셋 재키잉 결과에서 머리 경계의 초록 프린지가 육안으로 감소했다.
- [ ] alpha>0 픽셀의 green-dominant 비율이 하드닝 전보다 감소했다.
- [ ] 초록 눈동자/보석이 보존된 것이 스크린샷으로 확인된다.

위 네 항목은 `030_chroma_despill_hardening.md:50-56`의 수용 기준을 그대로
실행 가능한 체크리스트로 옮긴 것이다. 하나라도 미통과·판단 불가이면 레인은
`NEEDS_HUMAN`으로 유지하고, 실패 asset ID/설정/캡처를 다음 구현 사이클의 입력으로
남긴다.

## 사람 수용 후 남은 순서

1. 020·030의 사람 수용 증거를 확인하고 결과를 기록한다. 실패 시 그 결과를 먼저
   고친다.
2. P1-1(폼 2단계 재구성)의 사용자 가치, 단계 구성, 성공 기준을 인터뷰로 확정한다.
3. P2 전체는 항목 자체가 정의되지 않았으므로, 후보 목록·우선순위·수용 기준을 같은
   인터뷰에서 결정한다. 결정 전에는 구현 task나 “남은 구현”으로 표시하지 않는다.
4. 확정된 P1-1/P2만 별도 구현 사이클로 분해하고, 각 항목에 자동 검증과 사람 수용
   필요 여부를 붙인다.

## 재개 절차와 검증 게이트

재개자는 먼저 이 문서, `010:3-6`, `020:28-33`, `030:50-56`을 읽고, 사람이 남긴
대표 asset ID·설정·캡처가 있는지 확인한다. 증거가 없으면 코드 변경보다 위의 사람
수용 절차를 먼저 실행한다. 범위가 확정된 P1-1/P2를 구현한 뒤에는 아래 게이트를
새로 실행한다.

```bash
# focused: 5 + 10 + 13 + 5 + 7 + 7 + 7 cases
node --import tsx --test \
  tests/asset-derived.test.ts \
  tests/background-presets.test.ts \
  tests/color-key.test.ts \
  tests/wand-erase.test.ts \
  tests/video-chroma-key.test.ts \
  tests/asset-gen-keying-preview-contract.test.js \
  tests/asset-gen-media-lightbox-contract.test.js
node --import tsx --test tests/card-news-contract.test.ts

npm run typecheck
npm run typecheck:tests
npm run test:inventory
npm test
cd ui && npm run build
```

2026-07-18 기준 위 focused 묶음과 card-news contract, 전체 `1665/1665`, 두
typecheck, UI build는 green이었다. 다만 이 과거 green 결과는 새 변경의 통과 증거가
아니므로 재개 구현 후에는 반드시 새로 실행한다.
