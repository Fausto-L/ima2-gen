---
created: 2026-07-12
tags: [ima2-gen, phase, assets, storage]
---

# Phase 050 — Assets 저장 계층 + 워크스페이스 (첫 기능 추가)

스펙: `004_gallery-chaining.md` 4-2. 여기부터 기능 구간. 이 저장 계층이
060(프리셋 저장)·070(요소)·080(노드 템플릿)의 공통 기반이라 기능 중
가장 먼저 간다.

## 범위

1. 서버: `/api/assets` — 폴더/태그 CRUD + 검색. `kind` 필드로
   image | video | element | preset | template 수용(070/080 대비).
2. 저장 형식: 미결정 항목(JSON 인덱스 vs SQLite)을 구현 착수 시점에
   스파이크 1회로 결정하고 이 문서에 기록.
3. UI: `#assets` 워크스페이스(030에서 예약한 레일 슬롯 활성화) —
   폴더 트리 + 태그 필터 + 검색 + 그리드(040 가상화 재사용).
4. 히스토리 → "보관" 승격 액션(040 오버레이에 추가). 자동 승격 없음.

## 스파이크 결정 — SQLite (2026-07-13, A-감사 반영 인용 교정)

JSON 인덱스 vs SQLite → **SQLite(better-sqlite3) 채택**. sol 탐사 근거:

- 구조화 저장소 관례가 이미 SQLite: `lib/db.ts:12-22`(singleton·WAL·FK·중앙 migrate),
  `lib/db.ts:25-176,219-269`(CREATE TABLE IF NOT EXISTS + 조건부 ALTER, 전 테이블 중앙 소유).
- ID·시각 관례: `s_/as_/aq_<ULID>` + epoch ms — `lib/sessionStore.ts:8-15`,
  `lib/agentStore.ts:48-65`. assets는 `a_`/`af_` 접두 ULID.
- better-sqlite3는 이미 production dep + native smoke 테스트:
  `package.json`(dependencies·allowScripts·smoke). 신규 의존성 0.
- JSON+`atomicWriteJson`은 단일 문서용 — CRUD마다 전체 재직렬화 필요
  (`lib/atomicWrite.ts:1-14`). 폴더/태그 다대다 + 복합 필터에 부적합.
- history의 3초 TTL full-scan(`lib/historyIndex.ts:6-35`,
  `lib/historyList.ts:29-105`)은 총량 무상한이라 검색 기반으로 복제 금지.
- 바이너리는 `generatedDir`에 그대로 두고 SQLite에는 카탈로그 행만
  (파일 경로 참조). `lib/assetLifecycle.ts:21-47`의 경로+symlink 제한 관례 유지.

## 루프 스펙 (WP1-3 공통)

- 아키타입: spec-satisfaction. 트리거: 사용자 050 착수 지시(HOTL goal 활성).
- 목표: 히스토리와 분리된 영속 Assets 계층 + `#assets` 워크스페이스 + 보관 승격.
- 논골: 060/070/080 기능 본체, 자동 승격, 바이너리 이동/복사, XMP 스키마 변경,
  HistoryStrip 오버레이 확장(040 출하 형태 유지), site/ 변경.
- Verifier: `npm run typecheck` / `typecheck:tests` / `npm test` /
  `test:inventory` / `cd ui && npm run build` + 인앱 브라우저 스모크 스크린샷.
- 종료: goalplan `implement-ima2-gen-phase-050-*` c1-c5 met. 리소스 바운드 ~4h.
- 에스컬레이션: 제품 스코프가 바뀌는 결정만 NEEDS_HUMAN.

## WP1 — 서버 계층 (diff-level)

**감사 반영(A, GO-WITH-FIXES): DDL은 `lib/db.ts` 중앙 `migrate()` 소유**
(`lib/db.ts:25-277` 관례, schema version 갱신 포함). `lib/assetsStore.ts`는
`getDb()` import 후 CRUD만 담당(`lib/sessionStore.ts:8-15` 관례) — 모듈 소유
ensure 없음.

**MODIFY `lib/db.ts`** — migrate()에 아래 DDL + 인덱스 추가, schema version 갱신:

```sql
asset_folders(id TEXT PK, name TEXT NOT NULL, parent_id TEXT NULL REF asset_folders,
              created_at INTEGER, updated_at INTEGER)
assets(id TEXT PK, kind TEXT NOT NULL CHECK(kind IN
         ('image','video','element','preset','template')),
       name TEXT NOT NULL, file_path TEXT NULL, folder_id TEXT NULL REF asset_folders,
       notes TEXT NULL, metadata TEXT NULL /*JSON*/, created_at INTEGER, updated_at INTEGER)
asset_tags(asset_id REF assets ON DELETE CASCADE, tag TEXT NOT NULL,
           PRIMARY KEY(asset_id, tag))
-- idx: assets(kind), assets(folder_id), assets(created_at DESC), asset_tags(tag)
```

**NEW `lib/assetsStore.ts`** (<400줄):

- `createAsset/getAsset/updateAsset/deleteAsset`(행+태그만 삭제, 파일 불변),
  `listAssets({kind?,folderId?,tag?,q?,cursor?,limit=50 max500})` —
  정렬 `created_at DESC, id DESC`, 커서는 `(createdAt,id)` 튜플 인코딩
  (`base64(createdAt:id)`), predicate `(created_at < ?) OR (created_at = ? AND
  id < ?)`. 동일-ms tie 테스트 필수.
- 폴더 무결성: create/move 시 parent 존재 검증(없으면 400 `INVALID_PARENT`),
  self/자손으로 move 금지(409 `FOLDER_CYCLE`), delete는 자산·하위 폴더 모두
  없을 때만(아니면 409 `FOLDER_NOT_EMPTY`). `listFolders/createFolder/`
  `updateFolder(name|parentId)/deleteFolder`, `listTags`.
- kind 검증은 route/store 경계 allowlist가 1차(400 `INVALID_ASSET_KIND`),
  SQLite CHECK는 방어 계층.

**NEW `routes/assets.ts`** (`routes/sessions.ts:28-95` 관례 — handler별
try/catch, 400/404/409/500 구조화 JSON):

| Method | Path | 동작 |
|---|---|---|
| GET | `/api/assets` | 목록+검색(kind/folderId/tag/q/cursor/limit) |
| POST | `/api/assets` | 승격/생성 `{filePath,kind,name?,folderId?,tags?,metadata?}` |
| PATCH/DELETE | `/api/assets/:id` | 수정(이름/폴더/태그/노트) / 카탈로그 삭제 |
| GET/POST | `/api/assets/folders` | 폴더 목록/생성 |
| PATCH/DELETE | `/api/assets/folders/:id` | 개명 / 빈 폴더 삭제 |
| GET | `/api/assets/tags` | distinct 태그 |

- 등록 순서 static-first: `/api/assets/folders*` → `/api/assets/tags` →
  `/api/assets` → `/api/assets/:id` (향후 GET :id 대비).
- `filePath`는 `generatedDir` 내부만 허용(`lib/assetLifecycle.ts` 관례), 탈출 시 400.
- **MODIFY `routes/index.ts:1-61`** — import + `registerAssetsRoutes(app, ctx)`.

**NEW `tests/assets-store.test.ts`, `tests/assets-routes.test.ts`** — 계약:
CRUD 왕복, 잘못된 kind→400, 없는 id→404, 비빈 폴더 삭제→409, filePath 탈출→400,
필터 단독+조합, 커서 페이지네이션(limit=2로 3건→2페이지 + 동일-ms tie),
`INVALID_PARENT`/`FOLDER_CYCLE`/`FOLDER_NOT_EMPTY`, image·video 두 kind 승격
메타데이터 왕복, 자산 삭제 후 파일 잔존 assert(파일시스템 확인).
격리(감사 7): env(`IMA2_CONFIG_DIR`,`IMA2_DB_PATH`)를 mkdtemp로 **import 전**
설정 → dynamic import → teardown에서 `closeDb()`+temp 제거
(`tests/agent-mode-queue-contract.test.ts:9-25` 관례).
인벤토리(감사 6): `node scripts/classify-tests.mjs`(쓰기 모드) 실행 후
`docs/migration/runtime-test-inventory.md` 갱신분 커밋 — 자동 등록 아님.

## WP2 — UI 워크스페이스 (diff-level)

| 파일 | 작업 |
|---|---|
| `ui/src/types.ts:1` | MODIFY `UIMode`에 `"assets"` |
| `ui/src/App.tsx:61-66` + `ui/src/store/storePersistence.ts:114-122` | MODIFY 정규화·persisted loader가 `assets` 보존(감사 1: 미수정 시 classic 강등으로 도달 불가) |
| `ui/src/components/MobileAppBar.tsx:11-19`, `MobileComposeSheet.tsx:25-42`, `Sidebar.tsx:17-30`, `MobileSettingsToggle.tsx:34-38` | MODIFY 폐쇄형 모드 분기에 assets 추가(감사 1·2) |
| `ui/src/components/NavRail.tsx:10-21,31-74,88-93` | MODIFY 해시 양방향 매핑 + `IconAssets`(18×18 stroke) + RAIL_ITEMS 엔트리 |
| `ui/src/i18n/en.json`, `ko.json` | MODIFY `nav.assets`, `assets.*`(검색/빈 상태/폴더/태그/토스트), `chain.saveToAssets` |
| `ui/src/App.tsx:28-42,61-75,128-145` | MODIFY lazy `AssetsWorkspace`, 정규화 통과, RightPanel/히스토리 숨김(agent 관례), mount 분기 |
| `ui/src/components/assets/AssetsWorkspace.tsx` | NEW 툴바(검색·kind·태그 필터)+트리+그리드 조립 |
| `ui/src/components/assets/AssetsFolderTree.tsx` | NEW (`PromptImportFolderSection.tsx:75-115` 관례) |
| `ui/src/components/assets/AssetsGrid.tsx` | NEW `useVirtualizer` 직접 사용(`GalleryDateGrid.tsx:20-82` 패턴, GenerateItem 결합 배제) + IO 썸네일 게이트(`HistoryStrip.tsx:76-114`) |
| `ui/src/styles/assets-workspace.css` + `ui/src/main.tsx` | NEW/MODIFY (`agent-workspace.css:1-42` 레이아웃 관례) |
| `ui/src/store/storeTypes.ts`, `useAppStore.ts` | MODIFY assets 상태/액션 타입 + 조합 |
| `ui/src/store/storeAssetsImpl.ts` | NEW fetch/mutate (`storeHistoryImpl.ts:46-75` 로딩 가드 관례) |
| `ui/src/lib/api-assets.ts` + `api.ts` | NEW/MODIFY DTO+클라이언트 (api-core 관례) |
| `ui/src/lib/resultChaining.ts:11-64` | MODIFY `saveToAssets` 액션(registry+실행 핸들러) |
| `ui/src/components/GalleryImageTile.tsx:23-79` | MODIFY ChainIcon + store plumbing |
| `ui/src/components/ResultActions.tsx:247-275` | MODIFY 뷰어 보관 버튼(공유 핸들러 재사용) |

- 모드 정책(감사 2): assets는 agent와 같은 workspace-only 모드 — Sidebar·
  RightPanel(`App.tsx:144`)·HistoryStrip(`App.tsx:67-75,128`)·모바일 compose/
  settings 토글 전부 숨김. `GalleryModal`은 050에서 재사용하지 않음(히스토리
  스토어 강결합, `GalleryModal.tsx:64-94`) — 타일 오버레이 액션만, 뷰어는 후속.
- `saveToAssets` 계약(감사 4·5): deps에 단일 액션 `saveToAssets(item)` 추가,
  POST body는 `{ filePath: item.filename, kind: item.mediaType === "video" ?
  "video" : "image", name: item.prompt 앞 80자 || filename, tags: [],
  metadata: { prompt, provider, model, mediaType, requestId?, sessionId?,
  createdAt } }` — `url`(`/generated/...`) 금지, `available =
  Boolean(item.filename)` (image·video 동일). 모든 caller(GalleryImageTile
  getStore plumbing, ResultActions) 동시 갱신.
- i18n은 nested 객체(`nav`/`chain`/`assets` 아래 중첩, flat dotted key 아님).
  모바일 레일 5개 아이템 소형 뷰포트 QA 포함(감사 residual).
- 040 "가상화 재사용"은 메커니즘 재사용으로 해석: `GalleryDateGrid`는
  `GenerateItem`+생성 스토어에 강결합(sol 탐사 확인)이라 컴포넌트 직수입 대신
  동일 패턴의 assets 전용 그리드. 빈 상태 3종(자산 0/폴더 빈/검색 0) 필수.

**활성화 시나리오** (C-ACTIVATION-GROUNDING-01): 보관 클릭→POST 성공 토스트→
`#assets` 그리드 표시+히스토리 불변(스크린샷); 검색/태그 필터→목록 변화(스크린샷);
자산 삭제→그리드 제거+파일 잔존; kind 400/폴더 409/경로 탈출 400은 테스트로.

## WP3 — 클로즈아웃

- 풀 게이트 fresh 재실행, `assets/050/` 스크린샷 정리.
- SoT 동기화(SOT-SYNC-01): `structure/03-server-api.md`(+필요시 01·04)에
  `/api/assets` 반영. 이 문서 상태 done.
- dev 커밋 분리: `feat(server): phase 050 assets store + routes` /
  `feat(ui): phase 050 assets workspace + 보관 chaining`.
  (주의: 기존 `package-lock.json` 버전 범프 변경은 이 페이즈 커밋에서 제외.)

## Done 기준

- Assets CRUD/검색 node:test 계약 + `test:inventory` 등록.
- 히스토리·Assets 분리 동작 스크린샷 → `assets/050/`.

상태: **done** (2026-07-13)

## Diff-Level Record

아래 수치는 각 커밋의 `git show --numstat` 기준이다. 050은 서버 기반, UI
워크스페이스, 최종 리뷰 수정의 세 sub-commit으로 분리되었으며 합계는 45개
file-touch, **+1,723 / -31**이다(커밋 간 동일 파일의 중복 touch 포함).

### 050-A — 서버 기반 (`45ba1ee`)

`feat(server): phase 050 assets library — SQLite store + /api/assets routes + contracts`
— **11 files, +937 / -10**.

| 파일 | 상태 | + | - | diff 역할 |
|---|---:|---:|---:|---|
| `docs/API.md` | M | 23 | 0 | Assets REST 계약 문서화 |
| `docs/migration/runtime-test-inventory.md` | M | 3 | 1 | 신규 계약 테스트 인벤토리 등록 |
| `lib/assetLifecycle.ts` | M | 2 | 2 | generated 경로 검증 재사용을 위한 export 조정 |
| `lib/assetsStore.ts` | A | 427 | 0 | asset/folder/tag CRUD, 필터, 커서 페이지네이션 |
| `lib/db.ts` | M | 40 | 3 | DB v6 및 assets 3개 테이블/인덱스 migration |
| `routes/assets.ts` | A | 203 | 0 | assets/folders/tags REST route와 입력 검증 |
| `routes/index.ts` | M | 2 | 0 | assets route 등록 |
| `structure/01-file-function-map.md` | M | 2 | 2 | 서버 파일 맵 동기화 |
| `tests/assets-routes-contract.test.ts` | A | 118 | 0 | HTTP 상태·경로 제한·CRUD 계약 |
| `tests/assets-store-contract.test.ts` | A | 115 | 0 | 저장소 CRUD·필터·폴더 무결성·cursor 계약 |
| `tests/inflight-persistence.test.ts` | M | 2 | 2 | DB schema version 기대값 v6 동기화 |
| **합계** |  | **937** | **10** | |

핵심 diff는 `assetsStore.ts`(+427)와 `routes/assets.ts`(+203)에 집중된다.
`db.ts`가 DDL을 중앙 소유하고, 두 신규 계약 테스트(+233)가 저장소 및 HTTP
경계를 각각 고정한다.

### 050-B — UI 워크스페이스 (`0a95636`)

`feat(ui): phase 050 assets workspace — #assets mode, folder tree, virtualized grid, 보관 chaining`
— **26 files, +640 / -13**.

| 파일 | 상태 | + | - | diff 역할 |
|---|---:|---:|---:|---|
| `structure/01-file-function-map.md` | M | 4 | 4 | UI 파일 맵 동기화 |
| `structure/03-server-api.md` | M | 22 | 0 | Assets API SoT 반영 |
| `structure/04-frontend-architecture.md` | M | 11 | 1 | assets mode/slice 구조 반영 |
| `ui/src/App.tsx` | M | 9 | 2 | lazy workspace mount 및 workspace-only 패널 정책 |
| `ui/src/components/GalleryImageTile.tsx` | M | 9 | 0 | 타일의 보관 chaining 진입점 |
| `ui/src/components/MobileAppBar.tsx` | M | 1 | 0 | assets mode 분기 |
| `ui/src/components/MobileComposeSheet.tsx` | M | 1 | 0 | assets mode에서 compose 숨김 |
| `ui/src/components/MobileSettingsToggle.tsx` | M | 1 | 1 | workspace-only mode 처리 |
| `ui/src/components/NavRail.tsx` | M | 12 | 0 | `#assets` 해시·아이콘·rail 항목 |
| `ui/src/components/ResultActions.tsx` | M | 14 | 0 | 결과 뷰의 보관 액션 |
| `ui/src/components/Sidebar.tsx` | M | 1 | 0 | assets mode에서 sidebar 숨김 |
| `ui/src/components/assets/AssetsFolderTree.tsx` | A | 93 | 0 | 계층 폴더 탐색/CRUD |
| `ui/src/components/assets/AssetsGrid.tsx` | A | 81 | 0 | virtualized assets grid |
| `ui/src/components/assets/AssetsWorkspace.tsx` | A | 36 | 0 | 트리·검색·kind/tag 필터 조립 |
| `ui/src/i18n/en.json` | M | 31 | 1 | 영문 assets/chaining 문구 |
| `ui/src/i18n/ko.json` | M | 31 | 1 | 국문 assets/chaining 문구 |
| `ui/src/lib/api-assets.ts` | A | 61 | 0 | Assets DTO와 API client |
| `ui/src/lib/api.ts` | M | 5 | 0 | assets client export |
| `ui/src/lib/resultChaining.ts` | M | 16 | 1 | `saveToAssets` 5번째 chaining action |
| `ui/src/main.tsx` | M | 1 | 0 | assets stylesheet 진입점 |
| `ui/src/store/storeAssetsImpl.ts` | A | 82 | 0 | 목록/폴더 CRUD 및 저장 slice |
| `ui/src/store/storePersistence.ts` | M | 1 | 0 | persisted assets mode 보존 |
| `ui/src/store/storeTypes.ts` | M | 32 | 0 | assets state/action 타입 |
| `ui/src/store/useAppStore.ts` | M | 22 | 1 | assets slice 조합 및 chaining 배선 |
| `ui/src/styles/assets-workspace.css` | A | 62 | 0 | workspace/tree/grid 레이아웃 |
| `ui/src/types.ts` | M | 1 | 1 | `UIMode`에 assets 추가 |
| **합계** |  | **640** | **13** | |

신규 UI의 중심은 FolderTree(+93), Grid(+81), Workspace(+36), API client(+61),
store slice(+82), CSS(+62)다. 나머지 diff는 `assets` 모드를 기존 폐쇄형 분기와
persist 경계에 연결하고, Gallery/Result에서 `saveToAssets`를 호출하도록 잇는다.

### 050-C — 최종 리뷰 수정 (`cbcf9e6`)

`fix(assets): phase 050 final-review fold-in — list-race guard, first-save reconcile, directory rejection, grid width + contracts`
— **8 files, +146 / -8**.

| 파일 | 상태 | + | - | diff 역할 |
|---|---:|---:|---:|---|
| `docs/migration/runtime-test-inventory.md` | M | 2 | 1 | 신규 UI-store 계약 테스트 등록 |
| `routes/assets.ts` | M | 2 | 2 | `lstatSync().isFile()`로 디렉터리 등록 거부 |
| `tests/assets-routes-contract.test.ts` | M | 2 | 0 | 디렉터리 거부 회귀 계약 |
| `tests/assets-ui-store-contract.test.ts` | A | 117 | 0 | stale 응답·첫 저장·필터 적합성 계약 |
| `tests/card-news-frontend-contract.test.js` | M | 1 | 1 | Vite import-meta 타입 처리와 계약 fixture 정렬 |
| `tests/vite-import-meta.d.ts` | A | 5 | 0 | UI store 계약 테스트용 Vite import-meta 선언 |
| `ui/src/components/assets/AssetsGrid.tsx` | M | 5 | 1 | virtual row/grid width 보정 |
| `ui/src/store/storeAssetsImpl.ts` | M | 12 | 3 | monotonic request generation 및 첫-save reconciliation |
| **합계** |  | **146** | **8** | |

리뷰에서 발견된 네 경계를 작은 fix commit으로 접었다. 목록 요청 generation은
늦게 도착한 이전 필터 응답을 폐기하고, 최초 보관은 현재 필터에 맞는 asset을
즉시 reconcile한다. 서버는 generated 경로 안의 디렉터리도 거부하며, grid는
virtual row의 실제 폭을 열 수에 맞춘다. 신규 계약 테스트(+117)가 이 세 store
시나리오를 고정하고 route 계약이 파일 타입 거부를 보강한다.

## 클로즈아웃 기록

- 커밋: `45ba1ee`(서버: db v6 + assetsStore + /api/assets + 계약 테스트),
  `0a95636`(UI: assets 모드 배선 + 워크스페이스 + 보관 체이닝 + SoT 문서),
  `cbcf9e6`(최종 리뷰 반영: 목록 레이스 가드·첫 저장 반영·디렉터리 거부·
  그리드 폭 보정 + 계약 테스트 3건 추가).
- sol 파견 7회: 탐사 2(스토리지 관례·UI 배선) → 계획 감사 1(GO-WITH-FIXES 5,
  전부 접힘) → 테스트/스토어/컴포넌트 워커 3 → WP2 재감사(GO-WITH-FIXES 2)
  → 최종 신선 리뷰어 1(GO-WITH-FIXES 4, 전부 수용·수정).
- 게이트: typecheck / typecheck:tests / npm test **1149 pass 0 fail** /
  test:inventory / ui build 전부 exit 0 (fresh).
- 렌더·활성화 증거: `assets/050/` 스크린샷 6장(워크스페이스·폴더 생성·보관
  토스트·비디오 자산 그리드·검색 빈 상태·모바일 390) + 승격 POST(video kind),
  검색 필터 전환, 2단계 삭제 후 파일 잔존(HEAD 200), 폴더 왕복.
- 잔여(후속 페이즈로): 자산 뷰어(GalleryModal 재사용은 별도 설계 필요),
  모바일 폴더 관리(현재 칩 필터만), 히스토리 스트립 오버레이 확장 없음(의도),
  inflight 폴링이 assets 모드에서 classic 스코프로 도는 것(무해, 문서화).

## 전체 파일 변경표

아래 표는 `45ba1ee`, `0a95636`, `cbcf9e6`의 `git show --numstat`을 한데
모은 실행 기록이다. 같은 파일이 후속 커밋에서 다시 수정된 경우 별도 행으로
남겼다. 따라서 파일 경로 기준 unique count가 아니라 **commit-file touch 45건**을
표현하며, 합계는 **+1,723 / -31**이다.

| Sub-commit | 파일 | 상태 | + | - | 책임/완료 결과 |
|---|---|---:|---:|---:|---|
| 050-A `45ba1ee` | `docs/API.md` | M | 23 | 0 | Assets HTTP 계약 공개 문서 추가 |
| 050-A `45ba1ee` | `docs/migration/runtime-test-inventory.md` | M | 3 | 1 | 서버 계약 테스트 인벤토리 등록 |
| 050-A `45ba1ee` | `lib/assetLifecycle.ts` | M | 2 | 2 | generated 경로 검증 함수 export 정리 |
| 050-A `45ba1ee` | `lib/assetsStore.ts` | A | 427 | 0 | SQLite asset/folder/tag 저장소 전체 구현 |
| 050-A `45ba1ee` | `lib/db.ts` | M | 40 | 3 | schema v6 DDL과 인덱스 추가 |
| 050-A `45ba1ee` | `routes/assets.ts` | A | 203 | Assets REST 라우트와 오류 매핑 |
| 050-A `45ba1ee` | `routes/index.ts` | M | 2 | 0 | `registerAssetsRoutes` 부트스트랩 연결 |
| 050-A `45ba1ee` | `structure/01-file-function-map.md` | M | 2 | 2 | 서버 파일 소유권 맵 갱신 |
| 050-A `45ba1ee` | `tests/assets-routes-contract.test.ts` | A | 118 | 0 | route 상태/응답/경로 보안 계약 |
| 050-A `45ba1ee` | `tests/assets-store-contract.test.ts` | A | 115 | 0 | store CRUD/필터/cursor/폴더 계약 |
| 050-A `45ba1ee` | `tests/inflight-persistence.test.ts` | M | 2 | 2 | schema version 기대값 5→6 |
| 050-B `0a95636` | `structure/01-file-function-map.md` | M | 4 | 4 | UI 신규 모듈 파일 맵 반영 |
| 050-B `0a95636` | `structure/03-server-api.md` | M | 22 | 0 | 서버 API SoT에 Assets 계약 추가 |
| 050-B `0a95636` | `structure/04-frontend-architecture.md` | M | 11 | 1 | assets mode와 Zustand slice 기록 |
| 050-B `0a95636` | `ui/src/App.tsx` | M | 9 | 2 | lazy workspace mount와 패널 배제 |
| 050-B `0a95636` | `ui/src/components/GalleryImageTile.tsx` | M | 9 | 0 | tile 보관 액션 배선 |
| 050-B `0a95636` | `ui/src/components/MobileAppBar.tsx` | M | 1 | 0 | assets workspace mode 인식 |
| 050-B `0a95636` | `ui/src/components/MobileComposeSheet.tsx` | M | 1 | 0 | assets에서 compose sheet 숨김 |
| 050-B `0a95636` | `ui/src/components/MobileSettingsToggle.tsx` | M | 1 | 1 | workspace-only toggle 정책 |
| 050-B `0a95636` | `ui/src/components/NavRail.tsx` | M | 12 | 0 | `#assets` hash, icon, rail item |
| 050-B `0a95636` | `ui/src/components/ResultActions.tsx` | M | 14 | 0 | 결과 뷰 보관 버튼 |
| 050-B `0a95636` | `ui/src/components/Sidebar.tsx` | M | 1 | 0 | assets에서 sidebar 숨김 |
| 050-B `0a95636` | `ui/src/components/assets/AssetsFolderTree.tsx` | A | 93 | 0 | 폴더 트리 탐색과 CRUD UI |
| 050-B `0a95636` | `ui/src/components/assets/AssetsGrid.tsx` | A | 81 | 0 | 반응형 virtual grid와 media tile |
| 050-B `0a95636` | `ui/src/components/assets/AssetsWorkspace.tsx` | A | 36 | 0 | 툴바/트리/그리드 조립 root |
| 050-B `0a95636` | `ui/src/i18n/en.json` | M | 31 | 1 | 영문 assets UX copy |
| 050-B `0a95636` | `ui/src/i18n/ko.json` | M | 31 | 1 | 국문 assets UX copy |
| 050-B `0a95636` | `ui/src/lib/api-assets.ts` | A | 61 | 0 | typed Assets API client |
| 050-B `0a95636` | `ui/src/lib/api.ts` | M | 5 | 0 | assets client re-export |
| 050-B `0a95636` | `ui/src/lib/resultChaining.ts` | M | 16 | 1 | `saveToAssets` registry/실행 분기 |
| 050-B `0a95636` | `ui/src/main.tsx` | M | 1 | 0 | assets CSS import |
| 050-B `0a95636` | `ui/src/store/storeAssetsImpl.ts` | A | 82 | 0 | Assets Zustand action 구현 |
| 050-B `0a95636` | `ui/src/store/storePersistence.ts` | M | 1 | 0 | persisted assets mode 허용 |
| 050-B `0a95636` | `ui/src/store/storeTypes.ts` | M | 32 | 0 | DTO/state/action 타입 추가 |
| 050-B `0a95636` | `ui/src/store/useAppStore.ts` | M | 22 | 1 | slice 초기값과 action wiring |
| 050-B `0a95636` | `ui/src/styles/assets-workspace.css` | A | 62 | 0 | desktop/mobile workspace 레이아웃 |
| 050-B `0a95636` | `ui/src/types.ts` | M | 1 | 1 | `UIMode` union에 `assets` 추가 |
| 050-C `cbcf9e6` | `docs/migration/runtime-test-inventory.md` | M | 2 | 1 | UI-store 회귀 테스트 등록 |
| 050-C `cbcf9e6` | `routes/assets.ts` | M | 2 | 2 | 디렉터리를 파일로 등록하지 못하게 차단 |
| 050-C `cbcf9e6` | `tests/assets-routes-contract.test.ts` | M | 2 | 0 | generated 내부 디렉터리 rejection 계약 |
| 050-C `cbcf9e6` | `tests/assets-ui-store-contract.test.ts` | A | 117 | 0 | race/첫 저장/필터 적합성 회귀 계약 |
| 050-C `cbcf9e6` | `tests/card-news-frontend-contract.test.js` | M | 1 | 1 | RightPanel 폐쇄형 분기 기대값 정렬 |
| 050-C `cbcf9e6` | `tests/vite-import-meta.d.ts` | A | 5 | 0 | test-scope Vite `import.meta.env` shim |
| 050-C `cbcf9e6` | `ui/src/components/assets/AssetsGrid.tsx` | M | 5 | 1 | padding 제외한 실제 grid 폭 계산 |
| 050-C `cbcf9e6` | `ui/src/store/storeAssetsImpl.ts` | M | 12 | 3 | request generation과 save reconcile |
| **합계** | **45 file-touch** |  | **1,723** | **31** | 서버→UI→리뷰 수정의 3단계 완료 |

## 050-A: 서버 기반 상세

### schema v5 → v6 migration

DDL 소유자는 `lib/db.ts`의 중앙 `migrate()`다. feature store가 자기 테이블을
lazy-create하지 않으므로 애플리케이션이 어느 순서로 모듈을 import해도 schema
version과 실제 테이블 구성이 어긋나지 않는다. `4ca3d55..45ba1ee`의 실제 추가
구문은 다음과 같다.

```sql
-- Assets Library (phase 050, schema v6)
CREATE TABLE IF NOT EXISTS asset_folders (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES asset_folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (
    kind IN ('image','video','element','preset','template')
  ),
  name       TEXT NOT NULL,
  file_path  TEXT,
  folder_id  TEXT,
  notes      TEXT,
  metadata   TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES asset_folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id TEXT NOT NULL,
  tag      TEXT NOT NULL,
  PRIMARY KEY (asset_id, tag),
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assets_kind
  ON assets(kind, created_at);
CREATE INDEX IF NOT EXISTS idx_assets_folder
  ON assets(folder_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assets_created
  ON assets(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag
  ON asset_tags(tag);
```

version marker 역시 같은 transaction lifecycle 안에서 `5`에서 `6`으로
올라간다.

```ts
const row = database
  .prepare("SELECT value FROM _meta WHERE key = 'schema_version'")
  .get() as { value?: string } | undefined;
if (!row) {
  database.prepare(
    "INSERT INTO _meta (key, value) VALUES ('schema_version', '6')",
  ).run();
} else if (row.value !== "6") {
  database
    .prepare("UPDATE _meta SET value = '6' WHERE key = 'schema_version'")
    .run();
}
```

### `assetsStore` 공개 API surface

`lib/assetsStore.ts`는 DB row를 camelCase API record로 바꾸고, 태그 정규화와
폴더 무결성, cursor pagination을 한 경계에서 책임진다. 공개 심볼별 계약은
다음과 같다.

| API | 입력 | 반환 | 불변식/오류 |
|---|---|---|---|
| `ASSET_KINDS` | 없음 | readonly kind allowlist | image/video/element/preset/template만 허용 |
| `assertAssetKind(value)` | unknown | `AssetKind` | 실패 시 400 `INVALID_ASSET_KIND` |
| `createAsset(input)` | kind/name/filePath/folderId/notes/metadata/tags | `AssetRecord` | `a_` ULID, asset+tags transaction |
| `getAsset(id)` | asset id | record 또는 null | 태그와 JSON metadata를 복원 |
| `listAssets(query)` | 6개 filter/page 필드 | `{assets,nextCursor}` | stable `(createdAt,id)` descending order |
| `updateAsset(id, patch)` | mutable catalog fields | record 또는 null | filePath/kind/id는 불변, tags replace |
| `deleteAsset(id)` | asset id | boolean | row만 삭제, FK로 tags cascade, 파일 불변 |
| `listFolders()` | 없음 | folder array | 이름 NOCASE 정렬 |
| `createFolder(input)` | name,parentId | folder record | `af_` ULID, parent 존재 검증 |
| `updateFolder(id,patch)` | name,parentId | folder 또는 null | self/descendant move 409 |
| `deleteFolder(id)` | folder id | boolean | child asset/folder가 있으면 409 |
| `listTags()` | 없음 | string array | distinct, lexical order |

입력 정규화 상수도 계약의 일부다.

```ts
const MAX_NAME = 200;
const MAX_NOTES = 10_000;
const MAX_TAGS = 20;
const MAX_TAG_LEN = 64;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
```

`createAsset`은 asset row와 tag rows를 하나의 transaction으로 기록한다.
중간에 tag insert가 실패하면 asset row만 남는 partial write가 없다.

```ts
export function createAsset(input: {
  kind: unknown;
  name?: unknown;
  filePath?: unknown;
  folderId?: unknown;
  notes?: unknown;
  metadata?: unknown;
  tags?: unknown;
}): AssetRecord {
  const kind = assertAssetKind(input.kind);
  const filePath = normalizeFilePath(input.filePath);
  const folderId = requireFolder(input.folderId);
  const name = normalizeName(input.name, filePath ?? "Untitled");
  const notes = normalizeNotes(input.notes);
  const metadata = serializeMetadata(input.metadata);
  const tags = normalizeTags(input.tags);
  const id = "a_" + ulid();
  const t = Date.now();
  const db = getDb();
  const run = db.transaction(() => {
    db.prepare(
      "INSERT INTO assets (id, kind, name, file_path, folder_id, notes, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, kind, name, filePath, folderId, notes, metadata, t, t);
    replaceTags(id, tags);
  });
  run();
  return { id, kind, name, filePath, folderId, notes,
    metadata: parseMetadata(metadata), tags, createdAt: t, updatedAt: t };
}
```

`listAssets`는 모든 선택 필터를 AND로 결합한다. `%`, `_`, `\\`는 LIKE
wildcard가 아니라 literal query로 검색되도록 escape한다. `limit + 1`행을 읽어
다음 페이지 존재 여부만 판별하고, 응답에는 요청 limit만 노출한다.

```ts
if (query.tag != null && query.tag !== "") {
  where.push(
    "EXISTS (SELECT 1 FROM asset_tags " +
    "WHERE asset_tags.asset_id = assets.id AND asset_tags.tag = ?)",
  );
  params.push(query.tag);
}
if (query.q != null && query.q.trim() !== "") {
  const like = `%${escapeLike(query.q.trim())}%`;
  where.push("(name LIKE ? ESCAPE '\\\\' OR IFNULL(notes, '') LIKE ? ESCAPE '\\\\')");
  params.push(like, like);
}
if (query.cursor) {
  const { createdAt, id } = decodeCursor(query.cursor);
  where.push("(created_at < ? OR (created_at = ? AND id < ?))");
  params.push(createdAt, createdAt, id);
}
```

cursor는 외부에 DB offset을 노출하지 않고 마지막 row tuple을 base64url로
전달한다. 같은 millisecond에 여러 row가 생성돼도 ULID id가 tie-breaker라
중복/누락 없이 다음 page로 이동한다.

```ts
function encodeCursor(createdAt: number, id: string): string {
  return Buffer.from(`${createdAt}:${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: number; id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const sep = decoded.indexOf(":");
  const createdAt = Number(decoded.slice(0, sep));
  const id = decoded.slice(sep + 1);
  if (sep <= 0 || !Number.isFinite(createdAt) || !id) {
    throw storeError(400, "INVALID_CURSOR", "cursor is not valid");
  }
  return { createdAt, id };
}
```

폴더 이동은 새 parent에서 root 방향으로 ancestor chain을 따라간다. 이동 대상
id를 만나면 자기 자신 또는 자기 descendant 아래로 이동하려는 것이므로
`FOLDER_CYCLE`이다.

```ts
function assertNoCycle(folderId: string, newParentId: string) {
  let current: string | null = newParentId;
  let hops = 0;
  while (current) {
    if (current === folderId) {
      throw storeError(
        409,
        "FOLDER_CYCLE",
        "folder cannot move under itself or its descendants",
      );
    }
    const parent = getDb()
      .prepare("SELECT parent_id AS parentId FROM asset_folders WHERE id = ?")
      .get(current) as { parentId: string | null } | undefined;
    current = parent?.parentId ?? null;
    if (++hops > 100) break;
  }
}
```

### routes endpoint surface

route 등록은 literal path를 parameter path보다 먼저 둔다. `/folders`나 `/tags`가
향후 `/api/assets/:id`의 id로 흡수되지 않는 순서다.

| Method | Path | Handler 입력 | 성공 응답 | 주 오류 |
|---|---|---|---|---|
| GET | `/api/assets/folders` | 없음 | 200 `{folders}` | 500 `DB_ERROR` |
| POST | `/api/assets/folders` | `{name,parentId?}` | 201 `{folder}` | 400 invalid name/parent |
| PATCH | `/api/assets/folders/:id` | `{name?,parentId?}` | 200 `{folder}` | 404/409 |
| DELETE | `/api/assets/folders/:id` | id | 200 `{ok:true}` | 404/409 |
| GET | `/api/assets/tags` | 없음 | 200 `{tags}` | 500 |
| GET | `/api/assets` | query filter/cursor | 200 `{assets,nextCursor}` | 400 invalid kind/cursor |
| POST | `/api/assets` | create payload | 201 `{asset}` | 400 kind/path/folder |
| PATCH | `/api/assets/:id` | mutable fields | 200 `{asset}` | 404 asset missing |
| DELETE | `/api/assets/:id` | id | 200 `{ok:true}` | 404 asset missing |

모든 handler는 try/catch로 store/path 오류를 `sendError`에 전달한다. 알려진
status/code는 보존하고 예상하지 못한 예외는 내부 세부를 code로 누출하지 않고
500 `DB_ERROR`로 통일한다.

```ts
function sendError(res: Response, e: unknown) {
  const status =
    typeof (e as { status?: unknown })?.status === "number"
      ? (e as { status: number }).status
      : 500;
  const code =
    status !== 500 && typeof (e as { code?: unknown })?.code === "string"
      ? (e as { code: string }).code
      : "DB_ERROR";
  res.status(status).json({ error: { code, message: errInfo(e).message } });
}
```

### generated-path security boundary

`filePath`는 브라우저 URL이 아니라 generated storage root 기준 상대 파일명이다.
route가 보안 경계를 소유하고 store는 catalog canonicalization만 담당한다.

1. image/video는 빈 `filePath`를 거절한다.
2. element/preset/template은 binary 없는 catalog row를 허용한다.
3. `resolveInGenerated()`가 `..` 및 root escape를 차단한다.
4. 존재하지 않는 path를 거절한다.
5. 최종 수정 이후 regular file이 아닌 디렉터리도 거절한다.
6. `assertRegularGeneratedPath()`가 symlink/regular-file 경계를 재검증한다.
7. DB에는 상대 path만 저장하고 delete는 실제 generated 파일을 지우지 않는다.

```ts
async function resolveValidatedFilePath(
  kind: string,
  raw: unknown,
): Promise<string | null> {
  const rel = typeof raw === "string" ? raw.trim() : "";
  if (!rel) {
    if (kind === "image" || kind === "video") {
      throw httpError(
        400,
        "INVALID_FILENAME",
        "filePath required for image/video assets",
      );
    }
    return null;
  }
  const abs = resolveInGenerated(config.storage.generatedDir, rel);
  if (!existsSync(abs) || !lstatSync(abs).isFile()) {
    throw httpError(
      400,
      "INVALID_FILENAME",
      "file does not exist in generated storage",
    );
  }
  await assertRegularGeneratedPath(abs);
  return rel;
}
```

## 050-B: UI 워크스페이스 상세

### component hierarchy와 mode 경계

```text
App
└─ uiMode === "assets"
   └─ Suspense
      └─ AssetsWorkspace
         ├─ AssetsFolderTree
         │  ├─ All-assets root button
         │  ├─ nested folder buttons
         │  └─ create / rename / move / delete controls
         └─ assets-workspace__main
            ├─ assets-toolbar
            │  ├─ title + item count
            │  ├─ debounced search input
            │  ├─ kind select
            │  └─ tag toggle buttons
            ├─ one of three Assets empty states
            └─ AssetsGrid
               ├─ virtual rows
               └─ AssetTile
                  ├─ image / near-viewport video / kind glyph
                  ├─ name + kind + first two tags
                  └─ two-step delete button
```

assets는 classic 화면에 panel 하나를 추가한 형태가 아니라 agent/card-news처럼
workspace-only mode다. 이 mode에서는 Sidebar, RightPanel, HistoryStrip, mobile
compose sheet, mobile settings toggle을 숨긴다. NavRail의 hash↔mode mapping은
`#assets`를 양방향으로 보존하고 persisted loader도 reload 후 classic으로
강등하지 않는다.

`AssetsWorkspace`는 검색 input의 즉시 표시값과 store filter 적용 시점을 분리해
타이핑마다 HTTP request를 만들지 않는다.

```tsx
const [query, setQuery] = useState(filters.q);

useEffect(() => {
  void loadAssets(true);
}, [loadAssets]);

useEffect(() => {
  const timer = window.setTimeout(
    () => setFilters({ q: query }),
    300,
  );
  return () => window.clearTimeout(timer);
}, [query, setFilters]);

const filtered = Boolean(filters.q || filters.kind || filters.tag);
const empty = assets.length === 0 && !loading;
const emptyTitle = filters.folderId
  ? "assets.emptyFolderTitle"
  : filtered
    ? "assets.emptySearchTitle"
    : "assets.emptyTitle";
```

### Zustand slice architecture — 10 actions

`storeTypes.ts`가 public AppState contract를, `storeAssetsImpl.ts`가 side effect를,
`useAppStore.ts`가 set/get binding과 초기 상태를 소유한다. action이 component
안에서 fetch를 직접 실행하지 않으므로 Gallery와 Result viewer도 같은 저장
경로를 공유한다.

| # | Action | 역할 | 상태 반영 |
|---:|---|---|---|
| 1 | `loadAssets(reset?)` | 현재 filter로 첫 page 또는 refresh | assets/cursor/folders/tags/loading |
| 2 | `loadMoreAssets()` | cursor 다음 page append | dedupe append/cursor/loading |
| 3 | `setAssetsFilters(patch)` | filter merge 후 reset load | assetsFilters + async replace |
| 4 | `saveToAssets(item)` | GenerateItem을 catalog row로 승격 | 적합한 현재 view에 prepend |
| 5 | `updateAssetItem(id,patch)` | 이름/폴더/노트/태그 수정 | id 일치 row replace |
| 6 | `deleteAssetItem(id)` | catalog row 삭제 | local row filter-out |
| 7 | `createAssetFolder(name,parentId?)` | folder 생성 | folder list refresh |
| 8 | `renameAssetFolder(id,name)` | folder 개명 | folder list refresh |
| 9 | `moveAssetFolder(id,parentId)` | folder parent 변경 | folder list refresh |
| 10 | `deleteAssetFolder(id)` | 빈 folder 삭제 | folders/tags refresh |

초기 state는 목록과 폴더/태그를 비우고 cursor null, filter null/empty로 시작한다.
컴포넌트가 workspace mount 시 `loadAssets(true)`를 호출하는 것이 hydration
activation point다.

```ts
export type AssetsFilters = {
  kind: string | null;
  folderId: string | null;
  tag: string | null;
  q: string;
};

export type AppState = {
  assets: AssetItem[];
  assetsFolders: AssetFolder[];
  assetsTags: string[];
  assetsLoading: boolean;
  assetsCursor: string | null;
  assetsFilters: AssetsFilters;
  loadAssets: (reset?: boolean) => Promise<void>;
  loadMoreAssets: () => Promise<void>;
  setAssetsFilters: (patch: Partial<AssetsFilters>) => void;
  saveToAssets: (item: GenerateItem) => Promise<boolean>;
  updateAssetItem: (id: string, patch: AssetUpdatePatch) => Promise<boolean>;
  deleteAssetItem: (id: string) => Promise<boolean>;
  createAssetFolder: (name: string, parentId?: string | null) => Promise<boolean>;
  renameAssetFolder: (id: string, name: string) => Promise<boolean>;
  moveAssetFolder: (id: string, parentId: string | null) => Promise<boolean>;
  deleteAssetFolder: (id: string) => Promise<boolean>;
};
```

### virtual grid 구현

`AssetsGrid`는 item 하나씩이 아니라 계산된 column 수만큼 asset을 row array로
묶고 row를 virtualize한다. 이 선택은 tile의 동적 column width를 CSS grid로
유지하면서 virtualizer의 vertical measurement를 단순하게 만든다.

```tsx
const GAP = 12;
const MIN_TILE = 180;
const columns = Math.max(
  1,
  Math.floor((width + GAP) / (MIN_TILE + GAP)),
);
const rows = useMemo(
  () => Array.from(
    { length: Math.ceil(assets.length / columns) },
    (_, i) => assets.slice(i * columns, (i + 1) * columns),
  ),
  [assets, columns],
);
const rowHeight =
  Math.max(MIN_TILE, (width - GAP * (columns - 1)) / columns)
  + 70
  + GAP;
```

`ResizeObserver`는 workspace 폭 변화와 responsive layout 전환을 감지한다.
최종 수정 이후 CSS padding을 빼고 실제 content box 폭을 사용한다.

```tsx
useEffect(() => {
  const node = rootRef.current;
  if (!node) return;
  const update = () => {
    const cs = getComputedStyle(node);
    const pad =
      (parseFloat(cs.paddingLeft) || 0)
      + (parseFloat(cs.paddingRight) || 0);
    setWidth(Math.max(0, node.clientWidth - pad));
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(node);
  return () => observer.disconnect();
}, []);
```

`@tanstack/react-virtual`은 scroll element와 estimated row height를 받아 보이는
row 및 overscan 4개만 렌더한다. 마지막 virtual row가 전체 rows의 끝에 닿으면
cursor가 있는 경우 다음 page를 요청한다.

```tsx
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => rootRef.current,
  estimateSize: () => rowHeight,
  overscan: 4,
});
const virtualRows = virtualizer.getVirtualItems();
const lastIndex = virtualRows.at(-1)?.index;
const requestMore = useCallback(() => {
  if (cursor && !loading) void loadMore();
}, [cursor, loading, loadMore]);
useEffect(() => {
  if (lastIndex === rows.length - 1) requestMore();
}, [lastIndex, requestMore, rows.length]);
```

image는 browser native lazy loading을 사용한다. video는 tile이 viewport의
300px 이내로 접근할 때만 element를 mount하고 `preload="metadata"`로 제한해
대규모 library에서 동시 media connection과 decode를 억제한다.

```tsx
const observer = new IntersectionObserver(
  ([entry]) => {
    if (entry?.isIntersecting) setNear(true);
  },
  { rootMargin: "300px" },
);

{url && item.kind === "video"
  ? (near ? <video src={url} preload="metadata" muted playsInline /> : null)
  : url
    ? <img src={url} alt="" loading="lazy" decoding="async" />
    : <span className="assets-tile__glyph">{item.kind[0].toUpperCase()}</span>}
```

### `api-assets.ts` contract

client는 모든 path segment를 `encodeURIComponent`하고 query는
`URLSearchParams`로 만든다. 응답 error parsing/auth/base URL 처리는 기존
`jsonFetch`를 재사용한다.

| 함수 | HTTP | 반환 타입 |
|---|---|---|
| `getAssets(input)` | GET `/api/assets?...` | `Promise<AssetsPage>` |
| `createAsset(input)` | POST `/api/assets` | `Promise<{asset}>` |
| `updateAsset(id,patch)` | PATCH `/api/assets/:id` | `Promise<{asset}>` |
| `deleteAsset(id)` | DELETE `/api/assets/:id` | `Promise<{ok:true}>` |
| `getAssetFolders()` | GET `/api/assets/folders` | `Promise<{folders}>` |
| `createAssetFolder(input)` | POST `/api/assets/folders` | `Promise<{folder}>` |
| `updateAssetFolder(id,patch)` | PATCH `/api/assets/folders/:id` | `Promise<{folder}>` |
| `deleteAssetFolder(id)` | DELETE `/api/assets/folders/:id` | `Promise<{ok:true}>` |
| `getAssetTags()` | GET `/api/assets/tags` | `Promise<{tags:string[]}>` |

```ts
export function getAssets(
  input: AssetsFilters & { cursor?: string | null; limit?: number },
): Promise<AssetsPage> {
  const params = new URLSearchParams();
  if (input.kind) params.set("kind", input.kind);
  if (input.folderId) params.set("folderId", input.folderId);
  if (input.tag) params.set("tag", input.tag);
  if (input.q) params.set("q", input.q);
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit) params.set("limit", String(input.limit));
  const query = params.toString();
  return jsonFetch<AssetsPage>(
    `/api/assets${query ? `?${query}` : ""}`,
  );
}
```

### `saveToAssets` chaining integration

shared chaining registry에 다섯 번째 action을 추가해 Gallery tile과 Result viewer가
같은 availability와 실행 함수를 사용한다. filename이 없는 remote-only item은
server의 generated-path 계약을 충족할 수 없으므로 버튼 자체를 숨긴다.

```ts
{
  id: "saveToAssets",
  labelKey: "chain.saveToAssets",
  available: (item) => Boolean(item.filename),
}
```

실행 흐름은 `executeChaining` → store `saveToAssets` → `saveToAssetsImpl` →
API `createAsset` 순이다. 성공/실패 toast도 shared executor에서 한 번만 결정한다.

```ts
case "saveToAssets": {
  try {
    const ok = await store.saveToAssets(item);
    store.showToast(
      t(ok ? "chain.savedToAssets" : "chain.saveToAssetsFailed"),
      !ok,
    );
  } catch {
    store.showToast(t("chain.saveToAssetsFailed"), true);
  }
  break;
}
```

GenerateItem에서 server payload로 가는 mapping은 다음과 같다.

| GenerateItem | Asset create field | 규칙 |
|---|---|---|
| `filename` | `filePath` | 필수, `/generated/` URL이 아닌 상대 경로 |
| `mediaType` | `kind` | video면 video, 나머지는 image |
| `prompt` | `name` | trim 후 앞 80자, 없으면 filename |
| 없음 | `tags` | 첫 보관은 빈 배열 |
| prompt/provider/model 등 | `metadata` | undefined key 제거 후 JSON object |

```ts
const metadata = Object.fromEntries(
  Object.entries({
    prompt: item.prompt,
    provider: item.provider,
    model: item.model,
    mediaType: item.mediaType,
    requestId: item.requestId,
    sessionId: item.sessionId,
    createdAt: item.createdAt,
  }).filter(([, value]) => value !== undefined),
);
const { asset } = await createAsset({
  filePath: item.filename,
  kind: isVideoItem(item) ? "video" : "image",
  name: (item.prompt || "").trim().slice(0, 80) || item.filename,
  tags: [],
  metadata,
});
```

## 050-C: 최종 수정 상세

### 수정 1 — stale list race guard

문제: 초기 구현의 `if (assetsLoading) return`은 load-more 중복은 막지만 filter
reset request도 막는다. 반대로 guard를 단순 제거하면 오래된 filter request가
나중에 도착해 최신 결과를 덮어쓸 수 있다.

Before (`0a95636`):

```ts
export async function loadAssetsImpl(reset, set, get) {
  if (get().assetsLoading) return;
  const replace = reset !== false;
  set({ assetsLoading: true });
  try {
    const filters = get().assetsFilters;
    const page = await getAssets({
      ...filters,
      cursor: replace ? null : get().assetsCursor,
    });
    // 응답 도착 순서와 무관하게 항상 state를 기록했다.
    set((state) => ({ assets: replace ? page.assets : [...state.assets, ...page.assets] }));
  } catch (error) {
    set({ assetsLoading: false });
  }
}
```

After (`cbcf9e6`):

```ts
let assetsRequestGeneration = 0;

export async function loadAssetsImpl(reset, set, get) {
  const replace = reset !== false;
  if (!replace && get().assetsLoading) return;
  const generation = ++assetsRequestGeneration;
  set({ assetsLoading: true });
  try {
    const filters = get().assetsFilters;
    const page = await getAssets({
      ...filters,
      cursor: replace ? null : get().assetsCursor,
    });
    const extras = replace
      ? await Promise.all([getAssetFolders(), getAssetTags()])
      : null;
    if (generation !== assetsRequestGeneration) return;
    set((state) => ({
      assets: replace ? page.assets : [...state.assets, ...page.assets],
      assetsLoading: false,
      ...(extras
        ? { assetsFolders: extras[0].folders, assetsTags: extras[1].tags }
        : {}),
    }));
  } catch (error) {
    if (generation === assetsRequestGeneration) {
      set({ assetsLoading: false });
    }
  }
}
```

reset load는 이전 request를 generation 증가로 invalidate할 수 있다. pagination은
여전히 loading 중 중복 요청을 거절한다. stale request의 catch도 최신 loading을
false로 바꾸지 못한다.

### 수정 2 — first-save reconciliation

문제: 초기 조건 `assets.length > 0` 때문에 빈 Assets workspace에서 첫 asset을
보관해도 POST는 성공하지만 grid는 계속 empty state를 표시했다.

Before:

```ts
if (get().assets.length > 0) {
  set((state) => ({
    assets: [
      asset,
      ...state.assets.filter((entry) => entry.id !== asset.id),
    ],
  }));
}
```

After:

```ts
const filters = get().assetsFilters;
const admitted =
  (!filters.kind || filters.kind === asset.kind)
  && !filters.tag
  && !(filters.q || "").trim()
  && !filters.folderId;

if (admitted) {
  set((state) => ({
    assets: [
      asset,
      ...state.assets.filter((entry) => entry.id !== asset.id),
    ],
  }));
}
```

빈 unfiltered view에는 첫 asset을 즉시 prepend한다. 반대로 tag/search/folder
filter가 걸려 있거나 kind가 일치하지 않으면 새 row를 억지로 주입하지 않는다.
server 저장 성공과 현재 view admission을 분리한 수정이다.

### 수정 3 — generated directory rejection

문제: `existsSync`만 확인하면 generated root 안의 디렉터리도 존재하는 path라
통과한다. 이후 helper가 일부 경계를 검증하더라도 route 계약 자체가 regular
file 요구를 명시하지 못했다.

Before:

```ts
import { existsSync } from "fs";

const abs = resolveInGenerated(config.storage.generatedDir, rel);
if (!existsSync(abs)) {
  throw httpError(
    400,
    "INVALID_FILENAME",
    "file does not exist in generated storage",
  );
}
```

After:

```ts
import { existsSync, lstatSync } from "fs";

const abs = resolveInGenerated(config.storage.generatedDir, rel);
if (!existsSync(abs) || !lstatSync(abs).isFile()) {
  throw httpError(
    400,
    "INVALID_FILENAME",
    "file does not exist in generated storage",
  );
}
```

회귀 테스트는 generated directory 안에 `subdir`를 실제로 만든 다음 POST가
400 `INVALID_FILENAME`인지 확인한다. `lstatSync`를 택했으므로 symlink 자체를
regular file로 오인하지 않고 후속 `assertRegularGeneratedPath`와 방어가 겹친다.

### 수정 4 — virtual grid content width

문제: `clientWidth`에는 좌우 padding이 포함된다. 이를 tile content width로
간주하면 column 계산과 실제 CSS grid 폭이 어긋나 마지막 column이 잘리거나
불필요하게 한 column이 더 선택될 수 있다.

Before:

```ts
const update = () => setWidth(node.clientWidth);
```

After:

```ts
const update = () => {
  const cs = getComputedStyle(node);
  const pad =
    (parseFloat(cs.paddingLeft) || 0)
    + (parseFloat(cs.paddingRight) || 0);
  setWidth(Math.max(0, node.clientWidth - pad));
};
```

`parseFloat(...) || 0`은 계산 가능한 px padding을 숫자로 만들고, `Math.max`
는 비정상 style/극소 viewport에서 음수 폭이 virtualizer로 전파되지 않게 한다.

## 데이터 모델

### 관계 개요

```text
asset_folders (self hierarchy)
  id <──────────── parent_id
  │
  └────< assets.folder_id
             │
             └────< asset_tags.asset_id
```

asset은 folder에 0개 또는 1개 소속된다. folder는 parent를 선택적으로 가지며
임의 깊이 tree를 이룬다. tag는 별도 tag master가 없는 문자열 association이라
asset과 tag의 논리적 다대다를 composite key로 표현한다.

### `assets`

| Column | SQLite type | Null | 제약/의미 |
|---|---|---:|---|
| `id` | TEXT | N | PK, `a_<ULID>` |
| `kind` | TEXT | N | CHECK 5종 allowlist |
| `name` | TEXT | N | 최대 200자 정규화 |
| `file_path` | TEXT | Y | generatedDir 상대 path; non-binary kind는 null 가능 |
| `folder_id` | TEXT | Y | FK→asset_folders.id, delete 시 SET NULL |
| `notes` | TEXT | Y | trim, 최대 10,000자 |
| `metadata` | TEXT | Y | JSON object serialization |
| `created_at` | INTEGER | N | epoch milliseconds |
| `updated_at` | INTEGER | N | epoch milliseconds |

인덱스는 kind 및 folder filter 뒤 created ordering을 지원하고,
`idx_assets_created(created_at DESC,id DESC)`가 cursor traversal order와 정확히
일치한다. asset 삭제는 catalog 삭제일 뿐 `file_path`가 가리키는 binary 삭제가
아니다.

### `asset_folders`

| Column | SQLite type | Null | 제약/의미 |
|---|---|---:|---|
| `id` | TEXT | N | PK, `af_<ULID>` |
| `name` | TEXT | N | trim, 최대 200자 |
| `parent_id` | TEXT | Y | self FK, parent 삭제 시 SET NULL |
| `created_at` | INTEGER | N | epoch milliseconds |
| `updated_at` | INTEGER | N | epoch milliseconds |

DB FK는 parent 삭제 시 orphan을 root로 올릴 수 있지만 store API는 그보다 강한
정책을 적용해 child folder 또는 asset이 하나라도 있으면 삭제 자체를 409로
거절한다. cycle은 SQLite FK만으로 막을 수 없으므로 `assertNoCycle`에서 검사한다.

### `asset_tags`

| Column | SQLite type | Null | 제약/의미 |
|---|---|---:|---|
| `asset_id` | TEXT | N | FK→assets.id, delete 시 CASCADE |
| `tag` | TEXT | N | trim, 최대 64자 |
| `(asset_id,tag)` | composite PK | N | 같은 asset의 중복 tag 방지 |

store는 입력 배열에서 문자열만 받고 빈 값 제거, trim, 길이 제한, dedupe, sort,
최대 20개 제한을 적용한다. update 시 patch에 tags가 있을 때만 전체 association을
transaction 안에서 replace한다.

### TypeScript record shape

```ts
export type AssetRecord = {
  id: string;
  kind: "image" | "video" | "element" | "preset" | "template";
  name: string;
  filePath: string | null;
  folderId: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type AssetFolderRecord = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
};
```

snake_case DB row는 SELECT alias와 `toRecord()`에서 camelCase DTO로 변환된다.
metadata parse가 실패하거나 object가 아니면 null로 안전하게 축소된다.

## API 계약 매트릭스

공통 오류 envelope:

```json
{
  "error": {
    "code": "INVALID_FILENAME",
    "message": "file does not exist in generated storage"
  }
}
```

### endpoint별 완전 계약

| Method | Path | Query params | Request body | Success response | Error status/code |
|---|---|---|---|---|---|
| GET | `/api/assets` | `kind?`, `folderId?`, `tag?`, `q?`, `cursor?`, `limit?` | 없음 | 200 `{assets: Asset[], nextCursor: string|null}` | 400 `INVALID_ASSET_KIND`, `INVALID_CURSOR`; 500 `DB_ERROR` |
| POST | `/api/assets` | 없음 | `{kind,filePath?,name?,folderId?,notes?,metadata?,tags?}` | 201 `{asset: Asset}` | 400 `INVALID_ASSET_KIND`, `INVALID_FILENAME`, `INVALID_FOLDER`; 500 |
| PATCH | `/api/assets/:id` | 없음 | `{name?,folderId?,notes?,metadata?,tags?}` | 200 `{asset: Asset}` | 400 `INVALID_FOLDER`; 404 `ASSET_NOT_FOUND`; 500 |
| DELETE | `/api/assets/:id` | 없음 | 없음 | 200 `{ok:true}` | 404 `ASSET_NOT_FOUND`; 500 |
| GET | `/api/assets/folders` | 없음 | 없음 | 200 `{folders: AssetFolder[]}` | 500 `DB_ERROR` |
| POST | `/api/assets/folders` | 없음 | `{name,parentId?}` | 201 `{folder: AssetFolder}` | 400 `INVALID_NAME`, `INVALID_PARENT`; 500 |
| PATCH | `/api/assets/folders/:id` | 없음 | `{name?,parentId?}` | 200 `{folder: AssetFolder}` | 400 `INVALID_NAME`, `INVALID_PARENT`; 404 `FOLDER_NOT_FOUND`; 409 `FOLDER_CYCLE`; 500 |
| DELETE | `/api/assets/folders/:id` | 없음 | 없음 | 200 `{ok:true}` | 404 `FOLDER_NOT_FOUND`; 409 `FOLDER_NOT_EMPTY`; 500 |
| GET | `/api/assets/tags` | 없음 | 없음 | 200 `{tags:string[]}` | 500 `DB_ERROR` |

### `GET /api/assets`

Query semantics:

| Parameter | 형식 | 기본값 | 동작 |
|---|---|---|---|
| `kind` | 5종 string | 전체 | exact kind equality |
| `folderId` | folder id | 전체 | exact folder equality; root-only 특수값은 없음 |
| `tag` | string | 전체 | association EXISTS exact match |
| `q` | string | empty | name 또는 notes의 escaped LIKE contains |
| `cursor` | base64url tuple | first page | `(createdAt,id)` 다음 구간 |
| `limit` | positive number | 50 | floor 후 최대 500 clamp |

필터는 모두 AND다. 응답 asset은 `createdAt DESC, id DESC` 순이며, 마지막
page에서는 `nextCursor: null`이다.

```json
{
  "assets": [
    {
      "id": "a_01J...",
      "kind": "image",
      "name": "studio portrait",
      "filePath": "2026/07/result.png",
      "folderId": null,
      "notes": null,
      "metadata": { "provider": "openai", "prompt": "studio portrait" },
      "tags": ["portrait", "selected"],
      "createdAt": 1783910000000,
      "updatedAt": 1783910000000
    }
  ],
  "nextCursor": "MTc4MzkxMDAwMDAwMDphXzAxSi4uLg"
}
```

### `POST /api/assets`

image/video에는 `filePath`가 필수다. element/preset/template은 filePath null을
허용한다. `name`이 비어 있으면 filePath, 그것도 없으면 `Untitled`을 쓴다.

```json
{
  "kind": "video",
  "filePath": "grok/clip.mp4",
  "name": "orbit camera test",
  "folderId": "af_01J...",
  "notes": "approved take",
  "tags": ["motion", "approved"],
  "metadata": {
    "provider": "grok",
    "model": "grok-video",
    "requestId": "req_01J..."
  }
}
```

성공은 201 `{asset}`이다. generated root escape, missing file, directory, symlink
경계 위반은 모두 400 `INVALID_FILENAME`으로 수렴한다.

### `PATCH /api/assets/:id`

mutable field만 받는다. `kind`, `filePath`, `id`, `createdAt`은 이 endpoint에서
변경할 수 없다. omitted field는 유지하고 명시적 `folderId: null`은 root로
이동한다. `tags: []`는 모든 tag association을 제거한다.

```json
{
  "name": "final hero image",
  "folderId": null,
  "notes": "ready for export",
  "tags": ["hero", "final"]
}
```

없는 id는 404 `{error:{code:"ASSET_NOT_FOUND",...}}`다.

### `DELETE /api/assets/:id`

성공 시 catalog row와 FK cascade tag rows만 제거한다.

```json
{ "ok": true }
```

`filePath`의 실제 파일은 그대로 남는다. 이 phase의 승격/해제 의미가 파일
복사/이동/삭제가 아니라 catalog membership이기 때문이다.

### folder endpoints

folder create:

```json
{
  "name": "Campaign A",
  "parentId": null
}
```

folder update는 rename과 move를 한 endpoint에서 지원한다.

```json
{
  "name": "Campaign A selects",
  "parentId": "af_parent"
}
```

parent가 없으면 400 `INVALID_PARENT`, 자기 자신이나 descendant면 409
`FOLDER_CYCLE`, 삭제 대상에 child asset/folder가 있으면 409
`FOLDER_NOT_EMPTY`다. 없는 target id는 PATCH/DELETE 모두 404
`FOLDER_NOT_FOUND`다.

### `GET /api/assets/tags`

별도 tag 생성/삭제 endpoint는 없다. asset create/update의 tags 배열이 association
source of truth이고, tag 목록은 현재 association에서 distinct projection한다.

```json
{
  "tags": ["approved", "motion", "portrait", "selected"]
}
```

### 오류 코드 인덱스

| HTTP | Code | 발생 경계 | 의미 |
|---:|---|---|---|
| 400 | `INVALID_ASSET_KIND` | store/POST/list | kind allowlist 위반 |
| 400 | `INVALID_FILENAME` | POST route | filePath 필수/escape/missing/non-file 위반 |
| 400 | `INVALID_FOLDER` | asset create/update | asset folder id가 형식 오류 또는 없음 |
| 400 | `INVALID_PARENT` | folder create/update | parent id가 없거나 유효하지 않음 |
| 400 | `INVALID_NAME` | folder create/update | folder name이 빈 값 |
| 400 | `INVALID_CURSOR` | asset list | cursor tuple decode/validation 실패 |
| 404 | `ASSET_NOT_FOUND` | asset patch/delete | 대상 catalog row 없음 |
| 404 | `FOLDER_NOT_FOUND` | folder patch/delete | 대상 folder row 없음 |
| 409 | `FOLDER_CYCLE` | folder move | self/descendant 아래 이동 시도 |
| 409 | `FOLDER_NOT_EMPTY` | folder delete | child asset 또는 child folder 존재 |
| 500 | `DB_ERROR` | 공통 error mapper | 예상하지 못한 내부/DB 오류 |

## 구현 검증과 회귀 계약

050-A의 store 계약은 create/get/update/delete 왕복, kind와 복합 filter, folder
무결성, 동일 timestamp cursor tie, metadata round-trip을 검증한다. route 계약은
실제 Express app을 띄워 HTTP status와 generated-path boundary, 파일 잔존을
검증한다.

050-C의 UI store 계약은 deferred fetch로 두 request의 resolve 순서를 직접
뒤집는다.

```ts
const stale = impl.loadAssetsImpl(true, store.set, store.get);
store.set({
  assetsFilters: {
    kind: null,
    folderId: null,
    tag: null,
    q: "fresh",
  },
});
const fresh = impl.loadAssetsImpl(true, store.set, store.get);

// fresh를 먼저 resolve하고 stale을 나중에 resolve한다.
// 최종 state에는 a_fresh 한 건만 남아야 한다.
assert.equal(assets[0].id, "a_fresh");
assert.equal(state.assetsCursor, null);
assert.equal(state.assetsLoading, false);
```

첫 저장과 filtered admission은 각각 독립 계약이다.

```ts
assert.equal(await impl.saveToAssetsImpl(item, store.set, store.get), true);
assert.equal((store.read().assets as Array<{ id: string }>)[0].id, "a_first");

// tag filter가 활성화된 view에 tagless 저장 결과를 주입하지 않는다.
assert.equal((filteredStore.read().assets as Array<unknown>).length, 0);
```

최종 fresh gate 기록은 server/type/test/UI build를 모두 포함한다.

| Gate | 완료 결과 |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:tests` | exit 0 |
| `npm test` | 1,149 pass / 0 fail |
| `npm run test:inventory` | exit 0, inventory synchronized |
| `cd ui && npm run build` | exit 0 |
| browser activation smoke | workspace/folder/save/video/search/mobile 증거 6장 |

이로써 050은 단순 CRUD 추가가 아니라 generated storage를 안전한 catalog로
승격하는 서버 경계, 대량 media를 다루는 virtual workspace, 기존 결과 surface의
공유 chaining, 비동기 list race와 첫 저장 UX까지 하나의 완료된 feature slice로
닫혔다.
