import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const playwrightPath = `${process.env.HOME}/.nvm/versions/node/v24.17.0/lib/node_modules/agbrowse/node_modules/playwright-core/index.mjs`;
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const root = new URL("http://127.0.0.1:3435/#create");
const evidenceRoot = "/Users/jun/Developer/new/700_projects/ima2-gen/devlog/_plan/260716_composer-tray";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

async function setViewport(width, height) {
  await page.setViewportSize({ width, height });
  assert.deepEqual(await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), { width, height });
}

async function openPromptSheet() {
  const rightPanelBackdrop = page.locator(".right-panel-backdrop");
  if (await rightPanelBackdrop.isVisible()) await rightPanelBackdrop.click({ force: true });
  const trigger = page.getByRole("button", { name: /Open prompt sheet|프롬프트 시트/ });
  const hitIsTrigger = await trigger.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === button || (hit != null && button.contains(hit));
  });
  assert.equal(hitIsTrigger, true);
  await trigger.click({ force: true });
  const sheet = page.locator("#mobile-generate-sheet.compose-sheet--open");
  await sheet.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const element = document.querySelector("#mobile-generate-sheet.compose-sheet--open");
    const transform = element ? getComputedStyle(element).transform : "";
    return transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";
  });
  return sheet;
}

await setViewport(390, 844);
await page.goto(root.href, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("ima2.locale", "en");
  localStorage.setItem("ima2.uiMode", "classic");
  localStorage.setItem("ima2.onboardingDismissed", "1");
  localStorage.removeItem("ima2.inFlight");
});
await page.reload({ waitUntil: "domcontentloaded" });
await setViewport(390, 844);

const sheet = await openPromptSheet();
const prompt = sheet.getByRole("textbox");
await prompt.fill("");
const fileInput = sheet.locator('input[type="file"][multiple]');
const transparentPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
await fileInput.setInputFiles([
  { name: "Image_1.png", mimeType: "image/png", buffer: transparentPng },
  { name: "Image_2.png", mimeType: "image/png", buffer: transparentPng },
]);
await sheet.locator('.composer__tray-slot[role="listitem"]').nth(1).waitFor();

await prompt.press("End");
await prompt.type(" @Jipy");
const jipy = page.getByRole("option").filter({ hasText: "Jipy" }).first();
await jipy.waitFor({ state: "visible" });
await jipy.dispatchEvent("mousedown");
await prompt.type(" waves in front of @Image_1, cinematic dusk light");
assert.equal(await sheet.locator('.composer__tray-slot[role="listitem"]').count(), 3);
assert.match(await sheet.locator(".composer__tray").getAttribute("aria-label"), /3/);
await page.screenshot({ path: `${evidenceRoot}/evidence-040-mobile-tray.png` });

await sheet.locator(".composer__tray-remove").first().click();
assert.equal(await sheet.locator('.composer__tray-slot[role="listitem"]').count(), 2);
assert.match(await prompt.inputValue(), /@Image_1/);
await page.screenshot({ path: `${evidenceRoot}/evidence-040-mobile-deadtag.png` });

await page.evaluate(() => {
  const job = [{ id: "qa-mobile-flight", prompt: "Cinematic cyberpunk portrait", startedAt: Date.now(), phase: "streaming", kind: "mcp-video" }];
  localStorage.setItem("ima2.inFlight", JSON.stringify(job));
  window.dispatchEvent(new StorageEvent("storage", { key: "ima2.inFlight" }));
});
const badge = sheet.locator(".inflight-badge--inline");
await badge.waitFor({ state: "visible" });
await badge.click();
const inlinePanel = sheet.locator("#mobile-inflight-panel");
await inlinePanel.waitFor({ state: "visible" });
assert.equal(await sheet.locator(".compose-sheet__inflight").evaluate((element) => getComputedStyle(element).overflowY), "visible");
await sheet.locator(".compose-sheet__body").evaluate((element) => { element.scrollTop = element.scrollHeight; });
await page.screenshot({ path: `${evidenceRoot}/evidence-040-mobile-inflight.png` });
const inflightHeader = sheet.locator(".compose-sheet__inflight-header");
await inflightHeader.focus();
await inflightHeader.click();
assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("inflight-badge") ?? false), true);
await badge.click();
await inlinePanel.waitFor({ state: "visible" });

await sheet.getByRole("tab", { name: /Controls/ }).click();
await sheet.getByRole("tab", { name: /Prompt/ }).click();
assert.equal(await badge.getAttribute("aria-expanded"), "false");
await badge.click();
await inlinePanel.waitFor({ state: "visible" });
await inlinePanel.locator(".in-flight-cancel").focus();
await page.evaluate(() => {
  localStorage.removeItem("ima2.inFlight");
  window.dispatchEvent(new StorageEvent("storage", { key: "ima2.inFlight" }));
});
await badge.waitFor({ state: "hidden" });
assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("generate-btn") ?? false), true);

await setViewport(320, 844);
assert.equal(await sheet.locator(".composer__tray-remove").first().evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return rect.width >= 43.9 && rect.height >= 43.9;
}), true);
await page.screenshot({ path: `${evidenceRoot}/evidence-040-mobile-320.png` });

await setViewport(390, 844);
await sheet.locator(".compose-sheet__handle").click({ force: true });
const mobileNavButtons = page.locator(".nav-rail--mobile .nav-rail__btn");
await mobileNavButtons.last().click();
await page.locator(".lang-toggle__btn").filter({ hasText: "KO" }).click();
await mobileNavButtons.nth(1).click();
await openPromptSheet();
await sheet.getByRole("tab", { name: /프롬프트/ }).waitFor({ state: "visible" });
await page.screenshot({ path: `${evidenceRoot}/evidence-040-mobile-ko.png` });
await sheet.locator(".compose-sheet__handle").click({ force: true });
await page.locator(".nav-rail--mobile .nav-rail__btn").first().click();
const homeReferenceStrip = page.locator(".home-prompt__reference-strip");
await homeReferenceStrip.waitFor({ state: "visible" });
assert.match(await homeReferenceStrip.innerText(), /2 refs|참조 2개/);
await page.screenshot({ path: `${evidenceRoot}/evidence-040-home-reference-strip.png` });

console.log(JSON.stringify({
  viewport390: "checked",
  viewport320: "checked",
  trayCount: 2,
  mention: "Jipy",
  inlineInflight: "checked",
  tabReset: "checked",
  focusRestore: "generate button",
  koreanRender: "checked",
  consoleErrors,
}, null, 2));
await browser.close();
