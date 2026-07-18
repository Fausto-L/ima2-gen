// 020 acceptance evidence: lightbox → KeyingPanel → save → list refresh captures.
// Run: node devlog/_plan/260715_assetgen_ux_overhaul/assets-acceptance/capture-020-flow.mjs
import { chromium } from "/Users/jun/.nvm/versions/node/v24.17.0/lib/node_modules/agbrowse/node_modules/playwright-core/index.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.IMA2_BASE || "http://127.0.0.1:3333";
const shot = (page, name) => page.screenshot({ path: path.join(here, name) });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 1. Asset-gen view → open media lightbox on a chroma (non-keyed) asset
//    (keying.open button renders only in AssetMediaLightbox when canKey:
//     kind !== "edit" && filename — AssetMediaLightbox.tsx:42,139)
await page.goto(`${BASE}/#asset-gen`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(3000);
// Target a rail tile that is a SOURCE (never a "(keyed)" derivative): prior
// save-to-project runs add keyed tiles with the same base name, so a plain
// first-text match is not idempotent.
const namedTile = page.locator(".assetgen-rail__tile", { hasText: /그려줘 흰색 배경이니까|지피티의 모습/ })
  .filter({ hasNotText: "(keyed)" }).first();
await namedTile.scrollIntoViewIfNeeded().catch(() => {});
await namedTile.click();
await page.waitForTimeout(1500);
await shot(page, "flow-1-lightbox-remove-bg-button.png");

// 2. Click 배경 제거 / Remove background → KeyingPanel on same asset
const removeBtn = page.locator("button", { hasText: /배경 제거|Remove background/i }).first();
const hasRemove = await removeBtn.count();
console.log("remove-bg button present:", hasRemove > 0);
if (hasRemove > 0) {
  await removeBtn.click();
  await page.waitForTimeout(2000);
  await shot(page, "flow-2-keying-panel.png");

  // 3. Save to project → back to assets list with new keyed result
  const saveBtn = page.locator("button", { hasText: /Save to project|프로젝트에 저장|저장/i }).first();
  console.log("save button present:", (await saveBtn.count()) > 0);
  if ((await saveBtn.count()) > 0) {
    await saveBtn.click();
    await page.waitForTimeout(3000);
    await shot(page, "flow-3-after-save-assets-refresh.png");
  }
}

// 4. kind=edit (already keyed) asset: lightbox WITHOUT the remove-bg button
await page.keyboard.press("Escape");
await page.goto(`${BASE}/#asset-gen`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(3000);
const keyedTile = page.locator(".assetgen-rail__tile", { hasText: "(keyed)" }).first();
if ((await keyedTile.count()) > 0) {
  await keyedTile.hover();
  await keyedTile.click();
  await page.waitForTimeout(1500);
  const gone = (await page.getByRole("button", { name: /배경 제거|Remove background/i }).count()) === 0;
  console.log("keyed asset: remove-bg button absent:", gone);
  await shot(page, "flow-4-keyed-no-button.png");
} else {
  console.log("keyed asset tile not found");
}

await browser.close();
console.log("captures done");
