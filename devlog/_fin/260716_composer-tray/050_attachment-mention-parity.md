# 050 — 첨부 @멘션 패리티 + 한도 막힘 해소 (wp5)

## 문제 (사용자 리포트, 2026-07-16)

1. 한 번 첨부하면 트레이("위에 있는 것")에 있는 항목만 참조 가능하다.
2. 프롬프트의 `@Image_N` 텍스트만 지워도 트레이 항목은 남아서 참조 이미지(etc)로 계속 전송된다 — 이 동작 자체는 유지(트레이가 단일 진실).
3. 그런데 지운 `@Image_N`을 다시 멘션으로 불러올 방법이 없다. `@` 메뉴는 element만 나열한다.
4. 한도가 찬 레인에서는 트레이가 차 있는 동안 첨부가 전부 막히고, paste 경로는 토스트 없이 조용히 실패한다 (`PromptComposer.onPaste`의 `if (!canAddMore) return`, window paste 핸들러의 `if (trayItems.length >= maxRefs) return`).

## 원인 (코드 앵커)

- `ui/src/components/ElementMentionMenu.tsx` — `elements` prop만 받아 필터링; 트레이 attachment는 소스에 없다.
- `ui/src/components/PromptComposer.tsx` (ElementMentionMenu 마운트부) — `elements.map(...)`만 전달. 트레이 attachment 태그 재삽입 경로 부재.
- `ui/src/components/PromptComposer.tsx` onPaste / window paste 핸들러 — 한도 도달 시 조기 return, 사용자 피드백 없음. `addReferencesImpl`은 `toast.refLimitExceeded`를 갖고 있으나 이 경로들은 그 앞에서 끊긴다.
- 파일 픽커 버튼은 `disabled={!canAddMore}`로 시각적 단서는 있으나 이유 설명이 없다.

## 설계 결정

- D5-1 **멘션 패리티**: `@` 메뉴 상단에 "In tray" 그룹으로 현재 트레이 항목(attachment+element)을 나열한다. 선택하면 트레이 변형 없이 해당 태그 텍스트(`@Image_1 `)만 캐럿에 재삽입한다. 이미 트레이에 있는 element를 고르는 경우도 동일 동작 유지.
- D5-2 **한도 피드백**: paste/픽커에서 한도 초과로 거부될 때 `toast.refLimitExceeded` 토스트를 항상 띄운다. "트레이 X로 슬롯을 비우세요" 안내 신규 키(en/ko) 검토.
- D5-3 **태그 삭제 의미 유지**: 프롬프트에서 태그 텍스트 삭제는 전송 내용을 바꾸지 않는다(트레이가 진실). 슬롯을 비우려면 트레이 X — 이 계약을 유지하고 멘션 재삽입으로 되살린다.

## Diff-level 계획

감사(A) 결과 수정: element 재멘션은 이미 동작한다(중복 `addTrayElement`가 null을 반환해도 onSelect가 기존 트레이 태그를 재삽입). 실제 갭은 attachment뿐이다. 메뉴는 flat `elements` prop이므로 별도 prop/그룹 대신 옵션 주입 방식을 쓴다.

1. `ui/src/components/ElementMentionMenu.tsx` — 변경 없음(옵션 주입으로 해결). `kind`에 attachment 표기가 필요하면 `ElementMentionKind` 확장만.
2. `ui/src/components/PromptComposer.tsx`
   - `elements` 옵션 배열 앞에 트레이 attachment 항목을 주입: `{ id: "tray:"+tokenId, name: tag, kind: "reference", thumbnail: source.dataUrl }`. 키보드 내비/필터는 기존 로직 재사용.
   - onSelect에서 `id.startsWith("tray:")`이면 트레이 무변형으로 mentionQuery 범위를 `@{tag} `로 치환만 한다(기존 캐럿 처리 재사용).
   - paste 두 경로: 한도 거부 시 `showToast(t("toast.refLimitExceeded"), true)`.
3. i18n 로케일: 필요 시 `toast.refLimitTrayHint` 추가(en/ko) 또는 기존 문구 보강.
4. 테스트: `tests/composer-mention-parity-contract.test.js` 신규 — (a) 멘션 메뉴 소스에 tray attachment 포함, (b) tray 옵션 선택이 트레이를 변형하지 않고 태그만 삽입, (c) paste 한도 거부가 토스트 호출, (d) 로케일 키 en/ko 존재.

## 검증

- `node --test tests/composer-mention-parity-contract.test.js` + 기존 트레이 계약 4종 회귀.
- `npm run typecheck`, `npm run typecheck:tests`, `cd ui && npx tsc --noEmit && npm run build`.
- 브라우저 QA: 첨부→태그 삭제→`@` 재멘션→한도 거부 토스트 확인 스크린샷.

## 구현 기록 (B)

- `ui/src/components/PromptComposer.tsx`: `TRAY_MENTION_PREFIX = "tray:"` 도입, 멘션 옵션 배열 앞에 트레이 attachment(`kind: "reference"`, thumbnail = dataUrl) 주입, tray 옵션 선택 시 `insertTagAtMention`으로 태그 텍스트만 재삽입(트레이 무변형). element 선택 경로도 같은 헬퍼를 재사용하도록 리팩토링. 두 paste 경로의 조기 return을 `toast.refLimitTrayFull`({max}) 토스트로 교체. window paste 핸들러의 지역변수 `t`가 i18n `t`를 가리는 섀도잉을 `target`으로 수정(빌드 오류였음).
- `ui/src/components/ElementMentionChip.tsx`: `ElementMentionKind`에 `"reference"` 추가(+라벨/아이콘).
- i18n en/ko: `toast.refLimitTrayFull` 신설 — 기존 `refLimitExceeded`는 "최대 5장" 하드코딩 문구라 동적 한도에 부적합.
- 테스트: sol 워커가 `tests/composer-mention-parity-contract.test.js` 5계약 작성(구조 계약 스타일, 기존 스위트 미러링). 리팩토링으로 낡아진 `composer-tray-ui-contract.test.js`의 inline replacement 단언을 `insertTagAtMention` 계약으로 갱신. 5스위트 23/23, 루트 typecheck+tests typecheck+UI build green.
