import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readSourceTree } from "./_readTree.mjs";

const read = (path) => readFileSync(path, "utf8");

const sheet = read("ui/src/components/MobileComposeSheet.tsx");
const inflightBadge = read("ui/src/components/composer/InFlightBadge.tsx");
const homeComposer = read("ui/src/components/home/HomePromptComposer.tsx");
const responsiveCss = read("ui/src/styles/responsive-layout.css");
const homeCss = read("ui/src/styles/home-workspace.css");
const navRailCss = read("ui/src/styles/nav-rail.css");
const composerCss = readSourceTree("ui/src/styles/progress-composer.css");
const en = JSON.parse(read("ui/src/i18n/en.json"));
const ko = JSON.parse(read("ui/src/i18n/ko.json"));

test("mobile prompt sheet uses the shared tray and an inline inflight disclosure", () => {
  assert.match(sheet, /<PromptComposer \/>/, "the mobile sheet should reuse the tray-owning composer");
  assert.match(sheet, /const MOBILE_INFLIGHT_PANEL_ID = "mobile-inflight-panel"/);
  assert.match(sheet, /useState\(false\)/);
  assert.match(sheet, /!open \|\| activeTab !== "prompt"/);
  assert.match(sheet, /<InFlightBadge[\s\S]*?variant="inline"[\s\S]*?panelId=\{MOBILE_INFLIGHT_PANEL_ID\}[\s\S]*?expanded=\{inflightExpanded\}[\s\S]*?onToggle=\{setInflightExpanded\}/);
  assert.match(sheet, /aria-controls=\{MOBILE_INFLIGHT_PANEL_ID\}/);
  assert.match(sheet, /<InFlightList variant="inline" panelId=\{MOBILE_INFLIGHT_PANEL_ID\} \/>/);
  assert.doesNotMatch(sheet, /<InFlightList \/>/, "the legacy compact list must not remain in the sheet");
  assert.match(inflightBadge, /variant === "inline"[\s\S]*?document\.getElementById\(panelId\)/);
  assert.match(inflightBadge, /activePanel\?\.contains\(activeElement\)[\s\S]*?triggerRef\.current\?\.focus\(\)/);
});

test("mobile layout grows the textarea and keeps tray, actions, and targets touch-safe", () => {
  assert.match(responsiveCss, /\.app\[data-mobile="1"\] > \.sidebar\s*\{[\s\S]*?display:\s*none/);
  assert.match(navRailCss, /\.nav-rail--mobile\s*\{[\s\S]*?z-index:\s*160/);
  assert.match(responsiveCss, /\.compose-sheet-backdrop\s*\{[\s\S]*?z-index:\s*170/);
  assert.match(responsiveCss, /\.compose-sheet\s*\{[\s\S]*?z-index:\s*180/);
  assert.match(responsiveCss, /\.compose-sheet__panel--prompt\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column/);
  assert.match(responsiveCss, /\.compose-sheet__panel--prompt \.composer__prompt-stack\s*\{[\s\S]*?flex:\s*1 1 160px[\s\S]*?min-height:\s*160px/);
  assert.match(responsiveCss, /\.compose-sheet__actions\s*\{[\s\S]*?position:\s*sticky[\s\S]*?bottom:\s*0/);
  assert.match(responsiveCss, /\.compose-sheet__panel--prompt \.composer__tray-thumbnail\s*\{[\s\S]*?width:\s*64px[\s\S]*?height:\s*64px/);
  assert.match(responsiveCss, /\.compose-sheet__panel--prompt \.composer__tray-remove\s*\{[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/);
  assert.match(responsiveCss, /\.compose-sheet__inflight-header\s*\{[\s\S]*?min-height:\s*44px/);
  const inflightRule = responsiveCss.match(/\.compose-sheet__inflight\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.doesNotMatch(inflightRule, /overflow-y/, "the sheet body must remain the only vertical scroll owner");
  assert.match(composerCss, /@media \(min-width:\s*801px\)[\s\S]*?\.composer--sidebar/, "the 70% desktop rule must stay desktop-only");
});

test("home exposes a compact read-only reference strip", () => {
  assert.match(homeComposer, /useAppStore\(\(state\) => state\.trayItems\)/);
  assert.match(homeComposer, /home-prompt__reference-strip/);
  assert.match(homeComposer, /trayItems\.map/);
  assert.doesNotMatch(homeComposer, /removeTrayItem/, "home must not edit shared tray references");
  assert.match(homeCss, /\.home-prompt__reference-strip\s*\{/);
  assert.match(homeCss, /\.home-prompt__reference-thumb\s*\{[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px/);
});

test("new tray visibility and mobile disclosure copy stays localized", () => {
  for (const locale of [en, ko]) {
    assert.equal(typeof locale.home.referenceTrayCount, "string");
    assert.equal(typeof locale.home.referenceTrayAria, "string");
    assert.equal(typeof locale.inflight.inlineCollapse, "string");
  }
});
