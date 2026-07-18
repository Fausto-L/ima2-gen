# 060 — Element Library 탑레벨 진입점 (wp7)

## 요구 (사용자, 2026-07-16 #assets 브라우저 코멘트)

"영구에셋(@로 참조되는거)는 여기 그거 관리하는 거를 하나 만들자 탑레벨에" — Assets 워크스페이스 폴더 사이드바(TOP LEVEL) 에 @멘션 가능한 영구 element(캐릭터/제품/스타일/장면)만 모아 보는 고정 진입점.

## 현재 구조 (코드 앵커)

- `ui/src/components/assets/AssetsFolderTree.tsx` — TOP LEVEL 헤딩 + "All assets" 버튼 + 폴더 rows. 필터는 `setAssetsFilters({folderId})`.
- `ui/src/store/storeAssetsImpl.ts` — `assetsFilters {q, kind, tag, folderId}`; `loadAssets`가 필터 반영해 `/api/assets` 질의.
- element는 별도 저장소가 아니라 `assets` 테이블의 `kind='element'` 행 (SoT: `~/.ima2/sessions.db` + `~/.ima2/generated/`).
- 툴바에 이미 kind Select("Elements")가 있으나 발견성이 낮음 — 사용자는 사이드바 고정 항목을 원함.

## 설계 결정

- D7-1: 새 페이지/라우트를 만들지 않는다. "Element Library"는 kind-scoped 뷰 — `setAssetsFilters({folderId:null, kind:"element"})`. 폴더가 아니므로 rename/delete 액션 없음.
- D7-2 (감사 수정): 사이드바 "All assets" 바로 아래 고정 배치, `@` 글리프로 멘션 연관성 표시. active 판정: `folderId===null && kind==="element"`. "All assets" 클릭과 **폴더 클릭 모두 kind를 리셋**(`kind:null`)해 element 뷰에서 빠져나온다 — 폴더 클릭이 kind를 유지하면 사이드바에 active 항목이 두 개 생긴다.
- D7-3 (감사 수정): element 뷰에서는 kind Select를 숨기지 않는다(값 바인딩이 filters.kind라 자동 동기화). element 전용 empty 분기는 `kind==="element" && !folderId && !q && !tag` 조건으로 기존 filtered/emptySearch 분기보다 **먼저** 평가한다 — `filtered`가 kind만으로 true가 되어 emptySearchTitle이 가려버리기 때문. 이 분기에도 asset-gen CTA를 노출한다.
- D7-4: 모바일(<=800px)에서 폴더 트리가 가로 칩 롤로 변하는 기존 패턴 유지 — 새 항목도 칩으로 노출.

## Diff-level 계획

1. `ui/src/components/assets/AssetsFolderTree.tsx`
   - `activeKind` 구독 추가; "All assets" 버튼 클릭 시 `{folderId:null, kind:null}`, active 클래스는 `folderId===null && kind!=="element"`.
   - 새 버튼 `.assets-folder-elements` (@ 글리프 + `assets.elementLibrary`), 클릭 시 `{folderId:null, kind:"element"}`, active는 `folderId===null && kind==="element"`.
   - FolderRow 클릭을 `{folderId: folder.id, kind: null}`로 수정해 element 뷰 이탈을 보장.
2. `ui/src/components/assets/AssetsWorkspace.tsx`
   - element 뷰 empty 상태: `kind==="element" && !folderId && !q && !tag && empty`를 folder/search 분기보다 먼저 평가, `assets.emptyElementsTitle/Body` + asset-gen CTA.
3. `ui/src/styles/assets-workspace.css` — `.assets-folder-elements`(글리프 간격, 구분선 여백), 모바일 칩 대응.
4. i18n en/ko — 중첩 `assets` 객체 안에 3키: `elementLibrary`, `emptyElementsTitle`, `emptyElementsBody`.
5. 테스트 `tests/assets-element-library-contract.test.js` — (a) 트리 소스에 elementLibrary 버튼+`{folderId:null, kind:"element"}` 필터, (b) All assets와 FolderRow 모두 kind 리셋, (c) 워크스페이스 element empty 분기가 filtered 분기보다 선행+CTA, (d) 로케일 3키 en/ko, (e) 행위 검증: `setAssetsFiltersImpl({kind:"element"})`가 `/api/assets?kind=element`를 질의(모킹 fetch).
6. **test-inventory 게이트**: 새 테스트 추가 후 `node scripts/classify-tests.mjs` 재생성 + `npm run test:inventory` 통과. (주의: 현재 병행 트리에서 이미 stale — 이 사이클은 자기 파일 추가분만 재생성하고 병행 작업의 stale 원인은 건드리지 않는다.)

## 수용 기준 (c7)

- 사이드바 탑레벨에 Element Library 항목이 보이고, 클릭 시 element만 그리드에 나온다 (Jipy 1건 확인).
- All assets 복귀 시 전체 목록 복원. element 0건 폴더 없는 상태에서 element 전용 empty 문구.
- 계약 테스트 신규 + 기존 5스위트 green, 루트/테스트 typecheck, ui tsc+build exit 0, 브라우저 QA 스크린샷.

## 검증

- `node --test tests/assets-element-library-contract.test.js` + 회귀 5종.
- `npm run typecheck && npm run typecheck:tests`; `cd ui && npx tsc --noEmit && npm run build`.
- agbrowse 데스크톱 스크린샷: element 뷰 활성 + Jipy 카드.
