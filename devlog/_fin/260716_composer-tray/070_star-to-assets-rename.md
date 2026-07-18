# 070 — 별표→에셋 공유 + 에셋 이름 변경 (wp8)

## 요구 (사용자, 2026-07-16)

1. 갤러리 별표(★)를 누르면 그 이미지가 에셋에도 같이 들어간다 ("별표 = 공유").
2. **입장만 같이, 해제는 각자**: 별표 OFF해도 에셋은 남고, 에셋 삭제해도 별표는 유지. 양쪽 상태는 독립.
3. 에셋 상세에서 이름 변경 가능해야 함 (element만이 아니라 image/video 에셋도).

## 현재 구조 (코드 앵커)

- 별표: `routes/history.ts` `POST /api/history/favorite` — browser_id 스코프 `gallery_favorites` 토글, `isFavorite` 반환. UI는 `GalleryImageTile` ★ 버튼 → `toggleFavorite`(storeHistoryImpl).
- 에셋 생성: `storeAssetsImpl.saveToAssetsImpl` — `createAsset({filePath, kind, name: prompt 앞 80자, tags, metadata})`. 서버 `routes/assets.ts` POST /api/assets.
- 이름 변경: `updateAssetItemImpl`(store) + `PATCH /api/assets/:id`(서버, name 지원 이미 확인) 존재. UI는 `ElementDetail`만 이름 편집; `AssetMetaDetail`(image/video 상세)은 읽기 전용 `<h2>`.

## 설계 결정

- D8-1 **입장 연결은 클라이언트 오케스트레이션**: `toggleFavorite`가 OFF→ON 전환으로 성공(`isFavorite:true`)했을 때만 에셋 생성. 서버 favorite 라우트는 건드리지 않는다(별표는 browser 스코프, 에셋은 전역 — 결합하면 스코프가 오염됨).
- D8-2 **idempotency**: 생성 전 기존 에셋을 filename으로 조회. 서버 GET /api/assets가 filename 필터가 없으므로 metadata.sourceFilename 대신 **tag "starred" + 클라이언트 filename 대조**가 아닌, 확실한 서버측 중복 방지를 위해 `createAsset` 전에 `GET /api/assets?q=<filename>` 대신 assets 스토어에 이미 로드된 목록+신규 조회 불가 → **서버에 filename 정확 매치 쿼리 파라미터 `filePath` 추가**(routes/assets.ts GET에 optional exact filter, listAssets에 file_path = ? 조건). 살아있는 동일 filePath 에셋이 있으면 생성 생략.
- D8-3 **태깅**: 생성 에셋에 `tags:["starred"]` — 기존 태그 필터 UI로 모아보기 가능, 새 사이드바 항목 불필요.
- D8-4 **해제 독립**: 별표 OFF는 에셋에 아무 것도 안 함. 에셋 삭제는 gallery_favorites에 아무 것도 안 함. (코드상 자연 상태 — 연결 로직을 ON 전환에만 두면 됨.)
- D8-5 **이름 변경 UI**: `AssetMetaDetail`에 이름 인라인 편집(연필 → input → Enter/blur 커밋, Escape 취소; AssetsFolderTree의 FolderRow 패턴 재사용). `updateAssetItem(id,{name})` 호출. element는 기존 ElementDetail 경로 유지.
- D8-6 토스트: 별표로 에셋 생성 시 `assets.starSaved`("에셋에 추가됨"), 이미 있으면 조용히 통과.

## Diff-level 계획 (감사 blockers=3 반영 개정)

감사 확정 사실: 실제 토글 소유자는 `storePromptImpl.toggleGalleryFavoriteImpl`(filename만 수신, `jsonFetchWithBrowserId`), 세션그룹 갤러리 항목은 store `history` 밖에 있을 수 있음, 스토어 모듈은 `import.meta.env` 때문에 Node 직접 import 불가.

1. **NEW `ui/src/lib/starAssetSync.ts`** (Node-import 가능한 순수 헬퍼, devMode/스토어 의존 금지): `syncStarredAsset(item: {filename, prompt?, mediaType?...}, api: {getAssets, createAsset, updateAsset})` — filePath 정확조회 → 없으면 POST(tags ["starred"], metadata origin:"star", kind는 item.mediaType/isVideoItem로 판정) → **있는데 starred 태그가 없으면 tag-union PATCH** → {created|tagged|noop} 반환. 오류는 throw로 위임.
2. `routes/assets.ts` — GET에 `filePath` exact filter (queryStr, **생성측과 동일한 canonicalization을 서버에서 적용** — lib/assetsStore.ts:97 canonicalizeStoredPath 재사용).
3. `lib/assetsStore.ts` — `listAssets`에 `filePath?: string` (`file_path = ?`).
4. `ui/src/lib/api-assets.ts` — `getAssets` params에 filePath 직렬화. **AssetsFilters 시그니처는 유지**하고 GetAssetsParams 확장으로 처리.
5. `ui/src/store/storePromptImpl.ts` — `toggleGalleryFavoriteImpl` 시그니처를 `(item: GenerateItem, ...)`로 확장(호출부: GalleryImageTile/GalleryModal/PromptDetailModal/GallerySessionGroups — 전부 item을 이미 보유). **별표 상태 반영을 먼저 커밋**한 뒤 ON 전환일 때만 별도 try/catch에서 `syncStarredAsset` 호출 — 실패해도 별표 롤백 없음, `assets.starSaveFailed` 토스트. 성공 시 `assets.starSaved` 토스트(created|tagged일 때만).
6. `ui/src/store/storeTypes.ts`/`useAppStore.ts` — 액션 시그니처 갱신.
7. `ui/src/components/assets/AssetsWorkspace.tsx` — `AssetMetaDetail`에 `onRename` prop 전달(부모에서 updateAssetItem 클로저) + 인라인 편집(연필→input→Enter/blur 커밋, Escape 취소).
8. i18n en/ko — 중첩 assets 객체 안에 `starSaved`, `starSaveFailed`, `renameAsset`.
9. 테스트 `tests/assets-star-rename-contract.test.ts` — **행위 검증은 starAssetSync를 직접 import**(모킹 api 객체): (a) 미존재→create(tags starred), (b) 존재+태그없음→tag-union PATCH, (c) 존재+starred→noop, (d) video kind 판정. 소스 계약: (e) storePromptImpl이 별표 커밋 후 별도 catch로 sync 호출+비롤백, (f) OFF 전환 sync 미호출, (g) AssetMetaDetail 인라인 편집+onRename, (h) 서버 filePath 필터+canonicalization, (i) 로케일 3키 en/ko. inventory 재생성+게이트.

## 수용 기준 (c8)

- 갤러리 ★ ON → Assets에 starred 태그로 1회만 생성(재별표 중복 없음). ★ OFF → 에셋 유지. 에셋 삭제 → 별표 유지.
- image 에셋 상세에서 이름 변경 후 그리드에 반영.
- 신규 계약 테스트 + 회귀(28개: 23+5) green, inventory 게이트, typecheck 3종+ui build exit 0, 브라우저 QA 스크린샷(별표→에셋 등장, 이름 편집).

## 검증

- `node --import tsx --test tests/assets-star-rename-contract.test.ts` + 회귀 6스위트.
- `npm run test:inventory`, `npm run typecheck`, `npm run typecheck:tests`, `cd ui && npx tsc --noEmit && npm run build`.
- 라이브 QA(:3333): 별표 클릭 → #assets에서 starred 태그 확인 → 별표 해제 → 에셋 잔존 확인 → 이름 변경.
