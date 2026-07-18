import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const playwrightPath = `${process.env.HOME}/.nvm/versions/node/v24.17.0/lib/node_modules/agbrowse/node_modules/playwright-core/index.mjs`;
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const root = new URL("http://127.0.0.1:3435/#create");
const evidenceRoot = "/Users/jun/Developer/new/700_projects/ima2-gen/devlog/_plan/260716_composer-tray";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

async function attach(fileInput, index) {
  const path = `/tmp/ima2-wp5-${index}.png`;
  await writeFile(path, png);
  await fileInput.setInputFiles(path);
}

async function dispatchImagePaste(targetSelector) {
  return page.evaluate(({ selector, bytes }) => {
    const target = selector === "window" ? window : document.querySelector(selector);
    if (!target) return false;
    const data = new DataTransfer();
    const file = new File([new Uint8Array(bytes)], "overflow.png", { type: "image/png" });
    data.items.add(file);
    return target.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    }));
  }, { selector: targetSelector, bytes: [...png] });
}

try {
  const response = await page.goto(root.href, { waitUntil: "domcontentloaded" });
  assert(response && response.status() < 400, `page returned ${response?.status() ?? "no response"}`);
  await page.evaluate(() => {
    localStorage.setItem("ima2.locale", "en");
    localStorage.setItem("ima2.uiMode", "classic");
    localStorage.setItem("ima2.onboardingDismissed", "1");
    localStorage.removeItem("ima2.inFlight");
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const composer = page.locator(".composer").first();
  await composer.waitFor({ state: "visible", timeout: 10_000 });
  const prompt = composer.locator("textarea.composer__textarea");
  const fileInput = composer.locator('input[type="file"][multiple]');
  const tray = composer.locator(".composer__tray");
  const trayItems = composer.locator('.composer__tray-slot[role="listitem"]');
  await prompt.fill("");

  await attach(fileInput, 1);
  await trayItems.first().waitFor({ state: "visible" });
  assert.match(await prompt.inputValue(), /@Image_1\s/);
  assert.equal(await trayItems.count(), 1);
  assert.match(await tray.getAttribute("aria-label"), /1\s*(?:\/|of)\s*\d+/i);

  await prompt.fill("A quiet landscape without an attachment tag ");
  assert.doesNotMatch(await prompt.inputValue(), /@Image_1/);
  assert.equal(await trayItems.count(), 1);

  await prompt.click();
  await prompt.press("End");
  await prompt.pressSequentially("@");
  const mentionMenu = page.locator(".element-mention-menu");
  await mentionMenu.waitFor({ state: "visible" });
  const firstOption = mentionMenu.getByRole("option").first();
  assert.match(await firstOption.innerText(), /Image_1/i);
  assert.match(await firstOption.innerText(), /reference/i);
  await page.screenshot({ path: `${evidenceRoot}/evidence-050-mention-menu.png` });

  await prompt.press("Enter");
  assert.match(await prompt.inputValue(), /@Image_1\s/);
  assert.equal(await trayItems.count(), 1);
  await page.screenshot({ path: `${evidenceRoot}/evidence-050-tag-reinserted.png` });

  const trayLabel = await tray.getAttribute("aria-label");
  const countMatch = trayLabel?.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i);
  assert(countMatch, `could not read tray count from ${trayLabel}`);
  const maxRefs = Number(countMatch[2]);
  for (let index = 2; index <= maxRefs; index += 1) {
    await attach(fileInput, index);
    await page.waitForFunction(
      (expected) => document.querySelectorAll('.composer__tray-slot[role="listitem"]').length === expected,
      index,
    );
  }
  assert.equal(await trayItems.count(), maxRefs);
  const attachButtons = composer.getByRole("button", { name: /Attach reference image/i });
  assert((await attachButtons.count()) > 0, "attach button not found");
  for (const button of await attachButtons.all()) assert.equal(await button.isDisabled(), true);

  await page.locator(".composer__header").click();
  await dispatchImagePaste("window");
  const toast = page.locator(".toast__message").filter({ hasText: /Reference tray is full/i }).first();
  let pasteFallback = "window paste";
  if (!(await toast.isVisible().catch(() => false))) {
    await dispatchImagePaste(".composer");
    pasteFallback = "composer paste fallback";
  }
  await toast.waitFor({ state: "visible", timeout: 5_000 });
  assert.match(await toast.innerText(), new RegExp(`Reference tray is full \\(${maxRefs}\\)`, "i"));
  assert.equal(await trayItems.count(), maxRefs);
  await page.screenshot({ path: `${evidenceRoot}/evidence-050-limit-toast.png` });

  const reactPattern = /React|Minified React error|hydration|Invalid hook call/i;
  const reactErrors = [...consoleErrors, ...pageErrors].filter((message) => reactPattern.test(message));
  assert.deepEqual(reactErrors, []);

  console.log(JSON.stringify({
    result: "PASS",
    viewport: "1440x900",
    locale: "en",
    uiMode: "classic",
    trayLimit: maxRefs,
    pastePath: pasteFallback,
    consoleErrors,
    pageErrors,
    reactErrors,
  }, null, 2));
} finally {
  await browser.close();
}
