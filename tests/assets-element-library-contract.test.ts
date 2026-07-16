import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";

const impl = await import("../ui/src/store/storeAssetsImpl.ts");
type StoreSet = Parameters<typeof impl.loadAssetsImpl>[1];
type StoreGet = Parameters<typeof impl.loadAssetsImpl>[2];

type AnyState = Record<string, unknown>;
type StorePatch = AnyState | ((state: AnyState) => AnyState);

const read = (path: string) => readFileSync(path, "utf8");
const folderTree = read("ui/src/components/assets/AssetsFolderTree.tsx");
const workspace = read("ui/src/components/assets/AssetsWorkspace.tsx");
const en = JSON.parse(read("ui/src/i18n/en.json")) as Record<string, Record<string, unknown>>;
const ko = JSON.parse(read("ui/src/i18n/ko.json")) as Record<string, Record<string, unknown>>;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeStore(overrides: AnyState = {}) {
  let state: AnyState = {
    assets: [],
    assetsFolders: [],
    assetsTags: [],
    assetsLoading: false,
    assetsCursor: null,
    assetsFilters: { kind: null, folderId: null, tag: null, q: "" },
    ...overrides,
  };
  const set = (patch: StorePatch) => {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  };
  const get = () => state;
  return {
    set: set as unknown as StoreSet, // justified: partial state fixture stands in for full AppState in slice-scoped test
    get: get as unknown as StoreGet, // justified: partial state fixture stands in for full AppState in slice-scoped test
    read: () => state,
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitForIdle(store: ReturnType<typeof makeStore>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (store.read().assetsLoading === false) return;
  }
  throw new Error("assets load did not settle");
}

describe("assets element library contract", () => {
  it("renders the pinned Element Library button with glyph, filter, and exclusive active state", () => {
    assert.match(folderTree, /className=\{`assets-folder-all assets-folder-elements\$\{activeId === null && activeKind === "element" \? " is-active" : ""\}`\}/);
    assert.match(folderTree, /onClick=\{\(\) => setFilters\(\{ folderId: null, kind: "element" \}\)\}/);
    assert.match(folderTree, /<span className="assets-folder-elements__glyph" aria-hidden="true">@<\/span>[\s\S]*?\{t\("assets\.elementLibrary"\)\}/);
    assert.match(folderTree, /className=\{`assets-folder-all\$\{activeId === null && activeKind !== "element" \? " is-active" : ""\}`\}/);
  });

  it("resets the kind filter from both All assets and folder rows", () => {
    assert.match(folderTree, /className=\{`assets-folder-all\$\{[\s\S]*?onClick=\{\(\) => setFilters\(\{ folderId: null, kind: null \}\)\}/);
    assert.match(folderTree, /className=\{`assets-folder-row__name\$\{[\s\S]*?onClick=\{\(\) => setFilters\(\{ folderId: folder\.id, kind: null \}\)\}/);
  });

  it("prioritizes the element-root empty state and keeps its asset-gen CTA", () => {
    assert.match(workspace, /const elementRootView = filters\.kind === "element" && !filters\.folderId && !filters\.q && !filters\.tag;/);
    assert.match(workspace, /const emptyTitle = elementRootView \? "assets\.emptyElementsTitle" : filters\.folderId \? "assets\.emptyFolderTitle" : filtered \? "assets\.emptySearchTitle"/);
    assert.match(workspace, /const emptyBody = elementRootView \? "assets\.emptyElementsBody" : filters\.folderId \? "assets\.emptyFolderBody" : filtered \? "assets\.emptySearchBody"/);
    assert.match(workspace, /\{elementRootView \|\| \(!filtered && !filters\.folderId\) \? \([\s\S]*?className="assets-empty__cta"[\s\S]*?setUIMode\("asset-gen"\)/);
  });

  it("defines Element Library empty-state copy under assets in English and Korean", () => {
    for (const locale of [en, ko]) {
      assert.equal(typeof locale.assets.elementLibrary, "string");
      assert.equal(typeof locale.assets.emptyElementsTitle, "string");
      assert.equal(typeof locale.assets.emptyElementsBody, "string");
    }
  });

  it("adds and removes the kind query when Element Library filters change", async () => {
    const store = makeStore();
    const urls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      const requestUrl = String(url);
      urls.push(requestUrl);
      if (requestUrl === "/api/assets/folders") return jsonResponse({ folders: [] });
      if (requestUrl === "/api/assets/tags") return jsonResponse({ tags: [] });
      return jsonResponse({ assets: [], nextCursor: null });
    }) as typeof fetch; // justified: deterministic fetch stub captures the filter query contract

    impl.setAssetsFiltersImpl({ kind: "element" }, store.set, store.get);
    await waitForIdle(store);
    impl.setAssetsFiltersImpl({ kind: null }, store.set, store.get);
    await waitForIdle(store);

    const listUrls = urls.filter((url) => url === "/api/assets" || url.startsWith("/api/assets?"));
    assert.deepEqual(listUrls, ["/api/assets?kind=element", "/api/assets"]);
  });
});
