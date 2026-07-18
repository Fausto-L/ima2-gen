# WP5 / 050 Browser QA Notes

Date: 2026-07-16  
Target: `http://127.0.0.1:3435/#create`  
Viewport: 1440x900  
Locale / UI mode: English / classic

## Result

PASS. The rebuilt `ui/dist` composer preserves attachment tray state independently from prompt tags, exposes tray attachments through the `@` mention menu, reinserts an attachment tag without duplicating the tray item, and displays the limit toast when a pasted image exceeds the tray limit.

## Scenario evidence

1. PASS — attaching one PNG through the hidden file input inserted `@Image_1 ` and produced one tray item (`Refs 1/5`).
2. PASS — removing the tag text with a textarea fill left the tray at one item.
3. PASS — typing `@` after a whitespace mention boundary opened `.element-mention-menu`; the first option was `Image_1`, kind `Reference`.
4. PASS — pressing Enter reinserted `@Image_1 ` and the tray remained at one item.
5. PASS — distinct PNGs filled the tray to its rendered limit of five; both attach controls were disabled. A window-level synthetic `ClipboardEvent` with a `DataTransfer` image triggered the real visible `Reference tray is full (5)` toast. No fallback path was needed.
6. PASS — no console errors, page errors, React errors, hydration errors, or invalid-hook errors were recorded.

The Generate button was never clicked; no paid generation request was initiated.

## Evidence files

- `evidence-050-mention-menu.png`
- `evidence-050-tag-reinserted.png`
- `evidence-050-limit-toast.png`

Automation: `wp5-browser-qa.mjs`
