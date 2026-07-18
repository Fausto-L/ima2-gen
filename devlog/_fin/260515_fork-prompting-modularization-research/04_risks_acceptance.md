---
created: 2026-05-15
tags: [risks, acceptance, verification]
status: proposed
---

# Risks And Acceptance Criteria

## Main Risks

### R1 — Store Bloat

The fork expands `useAppStore.ts` to 4690 lines. Current upstream is already large. Copying the fork pattern would make future state changes risky.

Mitigation:

- Add `ui/src/store/promptBuilderStore.ts` or `ui/src/store/promptBuilderSlice.ts`.
- Put pure helpers under `ui/src/lib/promptBuilder/`.
- Add only bridge points to `useAppStore`.

Acceptance:

- `useAppStore.ts` does not gain more than a small bridge block for prompt-builder handoff.
- Prompt Builder session persistence is testable without rendering the whole app.

### R2 — CSS Bloat

The fork's `ui/src/index.css` is 7977 lines. Current upstream already has separate CSS for canvas background cleanup, so feature CSS should follow that pattern.

Mitigation:

- Add feature CSS files and import them in `ui/src/main.tsx`.
- Keep component class names scoped by feature prefix.

Acceptance:

- Prompt Builder styles live in `ui/src/styles/prompt-builder.css`.
- Composer flow styles live in `ui/src/styles/composer-flow.css`.
- Sidebar history styles live in `ui/src/styles/sidebar-history.css`.
- Viewer transform styles live in `ui/src/styles/viewer-workflow.css`.

### R3 — Prompt Semantics Change

Adding `before` and `after` block placement changes final prompt order. That can alter generation results.

Mitigation:

- Preserve old default for existing blocks.
- Record composer prompt and inserted block snapshot in sidecar metadata.
- Allow users to move blocks explicitly.

Acceptance:

- Existing saved inserted prompts still compose in a deterministic order.
- Generated sidecar records `composerPrompt` and `composerInsertedPrompts`.
- Selecting old history items without these fields still works.

### R4 — Provider Boundary

Prompt Builder initially uses OAuth. API-provider users might expect the same model/default behavior.

Mitigation:

- Expose provider in backend type even if MVP supports OAuth only.
- Return explicit unsupported error for API path if deferred.
- Document behavior in skill/docs.

Acceptance:

- API-key-only environment fails with `PROMPT_BUILDER_PROVIDER_UNSUPPORTED`, not a generic 500.
- Future API transport can be added without changing UI request shape.

### R5 — Fork Regression Conflicts

Fork code removes or diverges from upstream improvements:

- current visible first-node action;
- deletion focus aftercare;
- shared gallery identity helpers;
- packaging/hardening work.

Mitigation:

- Use upstream current files as source of truth.
- Reimplement feature behavior in upstream modules.
- Do not paste entire fork components.

Acceptance:

- `ResultActions` still exposes visible first-node button.
- `HistoryStrip` still uses shared `galleryNavigation` helpers.
- `ima2` package/bin surfaces are unchanged.

## Proposed Test Matrix

### Backend

```bash
node --test tests/prompt-builder-contract.test.ts
npm run typecheck
```

Assertions:

- text chat uses OAuth chat-completions;
- image attachments use OAuth Responses;
- bad request errors are stable;
- upstream errors are summarized without leaking payloads;
- timeout is deterministic.

### Frontend Contract

```bash
node --test tests/prompt-builder-ui-contract.test.js
node --test tests/prompt-builder-structured-output.test.ts
node --test tests/composer-prompt-flow-contract.test.js
node --test tests/history-composer-restore-contract.test.js
node --test tests/sidebar-history-performance-contract.test.js
node --test tests/viewer-workflow-ui-contract.test.js
cd ui && npx tsc -b --noEmit
npm run ui:build
```

Assertions:

- Prompt Builder route wrapper exists in `ui/src/lib/api.ts`.
- Builder panel renders as separate module.
- Structured KO/EN cards expose apply/insert actions.
- Composer blocks can move before/after main prompt.
- Sidecar metadata records composer state.
- Selecting history restores composer state.
- **SUPERSEDED (2026-07-18):** This criterion was deliberately replaced by the Prompt Studio workspace-profile contract. `ui/src/lib/workspaceProfile.ts:19-25` keeps the composer untouched when a history item is selected; `tests/issue75-prompt-studio-state-contract.test.js:44` pins that behavior. This is intentional product behavior, not a regression.
- Sidebar history groups multimode sequences.
- Viewer zoom/pan is implemented through hook/component, not a large inline `Canvas.tsx` block.

### Full Regression

```bash
npm test
git diff --check
```

## Implementation Gates

### Gate 1 — Plan Audit

Before implementation:

- Verify exact current `main` line counts.
- Verify route names and store action names still match.
- Verify no active issue already covers the same scope.
- Verify fork attribution policy.

### Gate 2 — Build Verification

After implementation:

- Typecheck root and UI.
- Build UI/server/CLI.
- Run targeted tests.
- Run full `npm test`.
- Use browser screenshot for the desktop prompt-builder layout if layout slice is included.

### Gate 3 — External Review

If the implementation includes backend prompt-builder transport or large UI layout:

- Ask backend reviewer to verify OAuth/API boundary and privacy.
- Ask frontend reviewer to verify layout, keyboard handling, mobile preservation, and file-size/module boundaries.

## Recommended Issue Split

One large PR is risky. Split into issues or PRs:

1. `Prompt Builder backend endpoint and structured output contract`
2. `Prompt Builder panel and session store`
3. `Composer block ordering and history restore`
4. `Desktop classic bottom composer and right-panel builder tab`
5. `Sidebar history with grouped multimode sequences`
6. `Viewer zoom/pan and empty-state polish`

The first three are the core product value. The last three are UI ergonomics and can ship independently.

## Final Recommendation

Start with slices 1-3. They deliver the article's main value: embedded prompt refinement with structured Korean/English outputs and composer integration.

Do not begin with the full layout transplant. The fork's layout is useful as inspiration, but backend builder state and composer metadata must be correct first.
