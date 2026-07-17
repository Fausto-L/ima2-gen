---
created: 2026-07-17
tags: [ima2-gen, ux, composer, accessibility, refactor, plan]
---

# 030 — composer feedback, dead-tag a11y, and bounded split (F6–F9)

## Loop spec

- Archetype: feedback-contract repair + behavior-preserving extraction.
- Trigger: partial image paste가 초과분을 조용히 버리고, retired tag는 visual-only이며, composer textarea의 keyboard ring이 override되고, `PromptComposer.tsx`가 571줄이다.
- Goal: F6–F9를 한 phase에서 닫되 paste/toolbar만 분리하고 ElementMentionMenu 관련 로직은 byte-level로 보존한다.
- Non-goals: mention ranking/ARIA/menu 변경(병렬 ElementMentionMenu WT 소유), reference limit 정책 변경, toast store 재설계, toolbar visual redesign, ReferenceTray 구조 변경, provider별 attachment validation 변경.
- Verifier: `npm run typecheck`, `npm run typecheck:tests`, focused composer contract tests, `npm run test:inventory`, `npm test`, `cd ui && npm run build`, paste/SR/focus render-grounding, `wc -l ui/src/components/PromptComposer.tsx` ≤ 500.
- Stop: F6–F9 assertion, mention parity, line limit, local/global paste activation 및 keyboard/SR 관찰이 통과한다.
- Memory: 이 문서, `000_plan.md`, `002_code_friction_inventory.md`, 기존 composer contract tests, extraction manifest.
- Terminal: DONE / NEEDS_HUMAN(announcement copy/verbosity 결정) / BLOCKED(en/ko 또는 composer planned file이 병렬 modified).
- Escalation: 구현 시 mention 블록 이동이 필요하거나 신규 hook이 store public type 변경을 요구하면 중단하고 재계획한다.

## 현재 코드 근거 (2026-07-17, HEAD = WT for clean source files)

### F6 — partial paste silent drop

- `ui/src/components/PromptComposer.tsx:217-228`의 composer paste는 full(`!canAddMore`)일 때만 `toast.refLimitTrayFull`을 띄운다. room보다 파일이 많으면 `files.slice(0, room)`만 넘기고 사용자 피드백이 없다.
- 동일 문제가 window paste path `:247-265`에도 있다. 두 경로 모두 수정하지 않으면 textarea 바깥 paste에서 회귀한다.
- 현재 `addFilesAtCaret`(`:133-144`)과 `insertAttachmentTags`(`:111-122`)가 `void`라서 실제 추가 count를 caller가 알 수 없다.
- 기존 toast owner는 현재 WT `ui/src/store/storeUIImpl.ts:167-170`의 `showToastImpl(message, error, set)`이다. 이 파일은 병렬 modified 상태이므로 **수정하지 않고** `useAppStore.getState().showToast(...)`만 재사용한다.

### F7 — dead tag visual-only

- `ui/src/components/composer/DeadTagMirror.tsx:31-35`는 retired tag token을 정확히 계산한다.
- 하지만 return `:80-86`은 전체 mirror가 `aria-hidden="true"`이고 strike rect만 그린다. 따라서 screen reader에는 invalid/retired 상태가 전달되지 않는다.
- `ReferenceTray.tsx:23-80`은 tray list/remove/over-limit semantics를 이미 소유한다. dead 상태는 prompt overlay owner인 `DeadTagMirror`에 두는 것이 최소 변경이며 tray는 수정하지 않는다.
- 선택: textarea `aria-describedby` 상시 연결보다 **변화 시 한 번 announce하는 별도 `role="status" aria-live="polite"` sibling**을 사용한다. typing 때마다 help text를 재낭독하지 않고 dead tag Set이 바뀔 때만 상태 문자열이 바뀐다.

### F8 — 공통 focus ring을 뒤에서 제거

- `ui/src/styles/form-controls.css:17-20`은 `.prompt-area:focus-visible`에 `box-shadow: 0 0 0 2px var(--focus-ring)`을 제공한다.
- 뒤에 로드되는 `ui/src/styles/progress-composer.css:549-553`은 `.composer__textarea:focus, .composer__textarea:focus-visible` 모두 `box-shadow:none`으로 덮는다. mouse focus와 keyboard focus를 분리해야 한다.

### F9 — 571-line composer와 안전한 extraction seam

- `ui/src/components/PromptComposer.tsx`는 현재 정확히 571줄이다.
- paste 책임은 `:205-228,247-265`; toolbar 렌더/상태는 `:462-548`; 두 블록은 ElementMentionMenu와 독립적이다.
- mention imports/constants 및 동작은 `:10-15,29-31,124-131,406-453`에 있다. 이 phase에서 이 범위를 새 파일로 옮기거나 의미 변경하지 않는다.
- 선택: NEW `composer/usePromptPaste.ts`와 NEW `composer/PromptComposerToolbar.tsx`로만 분리한다. 예상 parent는 약 420–450줄이며 500줄 아래에 충분한 여유를 둔다.

## 필수 scope expansion (000 phase map 정정 사항)

`000_plan.md:40`은 composer/CSS/tests만 적었지만 `{added}/{total}/{max}` partial feedback과 `{tags}` live status는 기존 key로 정확히 표현할 수 없다. 하드코드 카피를 만들지 않기 위해 이 phase 구현 scope에 `ui/src/i18n/en.json`, `ko.json`의 **2개 leaf 추가만** 포함한다. 두 파일의 병렬 diff와 010에서 정리한 dictionary shape는 그대로 보존한다.

## 파일 변경 맵

| 상태 | 파일 | 변경 |
|---|---|---|
| MODIFY | `ui/src/components/PromptComposer.tsx` | add count 반환, paste hook/toolbar 사용, 기존 mention 블록 보존. |
| NEW | `ui/src/components/composer/usePromptPaste.ts` | local+window image paste, full/partial toast의 단일 owner. |
| NEW | `ui/src/components/composer/PromptComposerToolbar.tsx` | 기존 toolbar/storyboard JSX와 해당 local/store selectors 이동. |
| MODIFY | `ui/src/components/composer/DeadTagMirror.tsx` | unique dead tag status live region 추가. |
| MODIFY | `ui/src/styles/progress-composer.css` | keyboard-only focus-visible ring 복원. |
| MODIFY | `ui/src/i18n/en.json` | `toast.refLimitPartial`, `prompt.deadTagStatus` key 추가만. |
| MODIFY | `ui/src/i18n/ko.json` | en과 같은 2개 leaf 추가만. |
| MODIFY | `tests/composer-mention-parity-contract.test.js` | paste assertion source를 extracted hook으로 재지정; mention assertion 유지. |
| NEW | `tests/composer-feedback-contract.test.js` | F6–F9 및 ≤500줄 계약. |

`storeUIImpl.ts`, `ReferenceTray.tsx`, `ElementMentionMenu.tsx`, `ElementMentionChip.tsx`는 READ/재사용 대상이며 MODIFY하지 않는다.

## Before / after diff

### 1. 실제 추가 count를 반환하는 attachment seam

```diff
--- a/ui/src/components/PromptComposer.tsx
+++ b/ui/src/components/PromptComposer.tsx
@@
-  const insertAttachmentTags = (knownTokenIds: ReadonlySet<string>, caret: number) => {
+  const insertAttachmentTags = (knownTokenIds: ReadonlySet<string>, caret: number): number => {
     const added = useAppStore.getState().trayItems.filter(
       (item) => item.kind === "attachment" && !knownTokenIds.has(item.tokenId),
     );
-    if (added.length === 0) return;
+    if (added.length === 0) return 0;
@@
     requestAnimationFrame(() => textareaRef.current?.setSelectionRange(nextCaret, nextCaret));
+    return added.length;
   };
@@
-  const addFilesAtCaret = async (files: File[], caret: number, inspectMetadata: boolean) => {
-    if (files.length === 0) return;
+  const addFilesAtCaret = async (files: File[], caret: number, inspectMetadata: boolean): Promise<number> => {
+    if (files.length === 0) return 0;
@@
-        if (handled) return;
+        if (handled) return 0;
       }
       await addReferences(files);
-      insertAttachmentTags(knownTokenIds, caret);
-    } catch { /* attachment errors surface through the existing store toasts */ }
+      return insertAttachmentTags(knownTokenIds, caret);
+    } catch {
+      return 0; // attachment errors surface through the existing store toasts
+    }
   };
```

이 count는 “slice 크기”가 아니라 store가 처리한 뒤 새로 생긴 attachment token 수다.

### 2. F6: 두 paste path를 한 hook으로 이동하고 partial informational toast

```diff
--- /dev/null
+++ b/ui/src/components/composer/usePromptPaste.ts
@@
+import { useEffect, type ClipboardEvent } from "react";
+import { useI18n } from "../../i18n";
+import { useAppStore } from "../../store/useAppStore";
+
+type AddFilesAtCaret = (files: File[], caret: number, inspectMetadata: boolean) => Promise<number>;
+type UsePromptPasteOptions = {
+  maxRefs: number;
+  trayItemCount: number;
+  captureAttachmentCaret: () => number;
+  addFilesAtCaret: AddFilesAtCaret;
+};
+
+export function extractClipboardImages(items: DataTransferItemList | null): File[] {
+  if (!items) return [];
+  return Array.from(items).flatMap((item) => {
+    if (item.kind !== "file" || !item.type.startsWith("image/")) return [];
+    const file = item.getAsFile();
+    return file ? [file] : [];
+  });
+}
+
+export function usePromptPaste(options: UsePromptPasteOptions) {
+  const { maxRefs, trayItemCount, captureAttachmentCaret, addFilesAtCaret } = options;
+  const { t } = useI18n();
+
+  const addPastedFiles = async (files: File[], caret: number): Promise<void> => {
+    const room = Math.max(0, maxRefs - trayItemCount);
+    if (room === 0) {
+      useAppStore.getState().showToast(t("toast.refLimitTrayFull", { max: maxRefs }), true);
+      return;
+    }
+    const accepted = files.slice(0, room);
+    const added = await addFilesAtCaret(accepted, caret, false);
+    if (files.length > accepted.length) {
+      useAppStore.getState().showToast(
+        t("toast.refLimitPartial", { added, total: files.length, max: maxRefs }),
+        false,
+      );
+    }
+  };
+
+  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
+    const files = extractClipboardImages(event.clipboardData?.items ?? null);
+    if (files.length === 0) return;
+    event.preventDefault();
+    void addPastedFiles(files, captureAttachmentCaret());
+  };
+
+  useEffect(() => {
+    const handler = (event: globalThis.ClipboardEvent) => {
+      const target = event.target as HTMLElement | null;
+      if (["INPUT", "TEXTAREA"].includes(target?.tagName ?? "") || target?.isContentEditable) return;
+      const files = extractClipboardImages(event.clipboardData?.items ?? null);
+      if (files.length === 0) return;
+      event.preventDefault();
+      void addPastedFiles(files, useAppStore.getState().prompt.length);
+    };
+    window.addEventListener("paste", handler);
+    return () => window.removeEventListener("paste", handler);
+  }, [addFilesAtCaret, maxRefs, t, trayItemCount]);
+
+  return onPaste;
+}
```

Parent diff:

```diff
--- a/ui/src/components/PromptComposer.tsx
+++ b/ui/src/components/PromptComposer.tsx
@@
+import { usePromptPaste } from "./composer/usePromptPaste";
@@
-  const extractClipboardImages = ...
-  const onPaste = ...
-  useEffect(() => { /* window paste */ }, ...);
+  const onPaste = usePromptPaste({
+    maxRefs,
+    trayItemCount: trayItems.length,
+    captureAttachmentCaret,
+    addFilesAtCaret,
+  });
```

full path는 기존 error toast를 유지하고 partial path는 정상적으로 일부가 추가된 정보이므로 `error=false`를 사용한다. `storeUIImpl.ts` 변경은 없다.

### 3. F6/F7 i18n leaf 추가

```diff
--- a/ui/src/i18n/en.json
+++ b/ui/src/i18n/en.json
@@
   "toast": {
     "refLimitTrayFull": "Reference tray is full ({max})...",
+    "refLimitPartial": "Only {added} of {total} images were added (limit {max}).",
@@
   "prompt": {
     "deadTagHint": "Tag removed from the tray — shown as a reference only",
+    "deadTagStatus": "Unavailable references in the prompt: {tags}",
```

```diff
--- a/ui/src/i18n/ko.json
+++ b/ui/src/i18n/ko.json
@@
   "toast": {
     "refLimitTrayFull": "참조 트레이가 가득 찼습니다({max}개)...",
+    "refLimitPartial": "총 {total}개 중 {added}개만 추가됐습니다(한도 {max}개).",
@@
   "prompt": {
     "deadTagHint": "트레이에서 제거된 태그 — 참조로만 표시",
+    "deadTagStatus": "프롬프트에서 사용할 수 없는 참조: {tags}",
```

010 구현 후 생긴 dictionary 위치에 leaf만 추가하며 객체 재정렬을 하지 않는다.

### 4. F7: visual mirror 밖에 최소 live status 추가

```diff
--- a/ui/src/components/composer/DeadTagMirror.tsx
+++ b/ui/src/components/composer/DeadTagMirror.tsx
@@
 import { findTrayTagTokens } from "../../lib/referenceTray";
+import { useI18n } from "../../i18n";
@@
 export function DeadTagMirror({ prompt, retiredTags, textareaRef }: DeadTagMirrorProps) {
+  const { t } = useI18n();
@@
+  const deadTagNames = useMemo(
+    () => [...new Set(deadTokens.map((token) => `@${token.tag}`))],
+    [deadTokens],
+  );
@@
-  return (
-    <div ref={mirrorRef} className="composer__prompt-mirror" aria-hidden="true">
+  return (
+    <>
+      <div ref={mirrorRef} className="composer__prompt-mirror" aria-hidden="true">
         <span ref={textRef}>{prompt}</span>
         {rects.map((rect) => (
           <span key={rect.key} className="dead-tag" style={rect} />
         ))}
-    </div>
+      </div>
+      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
+        {deadTagNames.length > 0 ? t("prompt.deadTagStatus", { tags: deadTagNames.join(", ") }) : ""}
+      </span>
+    </>
   );
```

동일 tag가 prompt에 여러 번 있어도 unique name을 한 번만 읽는다. live node는 `aria-hidden` mirror의 sibling이므로 accessibility tree에 남는다.

### 5. F8: mouse focus reset과 keyboard ring 분리

```diff
--- a/ui/src/styles/progress-composer.css
+++ b/ui/src/styles/progress-composer.css
@@
-.composer__textarea:focus,
-.composer__textarea:focus-visible {
+.composer__textarea:focus {
   border: none;
   box-shadow: none;
 }
+.composer__textarea:focus-visible {
+  border: none;
+  box-shadow: 0 0 0 2px var(--focus-ring);
+}
```

공통 `.prompt-area` ring 토큰을 그대로 복원하며 새 색상/토큰을 만들지 않는다.

### 6. F9: toolbar/storyboard extraction, mention block 불가침

```diff
--- /dev/null
+++ b/ui/src/components/composer/PromptComposerToolbar.tsx
@@
+import { useState } from "react";
+import { continueFromItem } from "../../lib/continueFromItem";
+import { useI18n } from "../../i18n";
+import { useAppStore } from "../../store/useAppStore";
+import { SavePromptPopover } from "../SavePromptPopover";
+import { WebSearchToggle } from "../WebSearchToggle";
+
+type PromptComposerToolbarProps = {
+  canAddMore: boolean;
+  onAttach: () => void;
+};
+
+export function PromptComposerToolbar({ canAddMore, onAttach }: PromptComposerToolbarProps) {
+  // PromptComposer.tsx:462-548의 currentImage/video/direct/search/save/storyboard
+  // selectors, saveOpen local state, JSX를 순서·class·aria 속성 그대로 이동한다.
+  // parent와 공유하는 것은 canAddMore와 file-picker callback뿐이다.
+}
```

```diff
--- a/ui/src/components/PromptComposer.tsx
+++ b/ui/src/components/PromptComposer.tsx
@@
-import { SavePromptPopover } from "./SavePromptPopover";
-import { WebSearchToggle } from "./WebSearchToggle";
-import { continueFromItem } from "../lib/continueFromItem";
+import { PromptComposerToolbar } from "./composer/PromptComposerToolbar";
@@
-      <div className="composer__hint-row">...</div>
-      <div className="composer__toolbar">...</div>
-      <div className="composer__storyboard-row">...</div>
+      <PromptComposerToolbar canAddMore={canAddMore} onAttach={openFilePicker} />
```

이동 manifest:

- `PromptComposer.tsx:462-464` hint row.
- `:465-537` attachment/current-image/video/direct/web-search/save toolbar.
- `:538-548` storyboard row.
- 해당 block 전용 selectors `:71-76`, `setPromptMode`와 save state `:82,85`, imports `:4-6`.

보존 manifest:

- `TRAY_MENTION_PREFIX`, `insertTagAtMention`, `ElementMentionMenu` options/onSelect 전체.
- tray attachment mention이 elements보다 먼저 오는 순서.
- `addElementId?.(element.id)`와 tray-only early return.
- `ElementMentionMenu.tsx`/`ElementMentionChip.tsx` 파일은 미수정.

## 테스트 계획

신규 파일: `tests/composer-feedback-contract.test.js`.

검증 assertion:

1. local composer paste와 window paste가 모두 `usePromptPaste`의 `addPastedFiles`를 통과한다.
2. room=0은 기존 `toast.refLimitTrayFull` error toast, `0 < room < files.length`는 실제 `added/total/max` partial informational toast, room 충분 시 partial toast 없음.
3. `addFilesAtCaret`/`insertAttachmentTags`가 실제 새 token count를 반환한다.
4. en/ko의 `toast.refLimitPartial`은 `{added}`, `{total}`, `{max}`를 모두 포함하고 `prompt.deadTagStatus`는 `{tags}`를 포함한다.
5. DeadTagMirror의 visual wrapper는 계속 `aria-hidden`; sibling은 `role=status`, polite, atomic이며 unique `@tag` 목록을 출력한다.
6. CSS의 generic `:focus`는 shadow none, later `:focus-visible`은 `var(--focus-ring)` shadow를 갖는다.
7. `PromptComposer.tsx` line count가 500 이하이고 `PromptComposerToolbar`/`usePromptPaste`를 import한다.
8. toolbar extraction 후 class, i18n key, aria-pressed, SavePopover, WebSearchToggle, storyboard contract가 새 owner에 존재한다.
9. mention block signature는 기존 parity test와 동일하다.

기존 `tests/composer-mention-parity-contract.test.js`의 paste source만 조정한다.

```diff
 const composer = read("ui/src/components/PromptComposer.tsx");
+const paste = read("ui/src/components/composer/usePromptPaste.ts");
@@
-const composerPaste = composer.match(...);
-const windowPaste = composer.match(...);
+const composerPaste = paste.match(...);
+const windowPaste = paste.match(...);
```

mention assertions(`TRAY_MENTION_PREFIX`, ordering, early return)은 계속 `composer`를 읽는다.

```bash
node --test tests/composer-feedback-contract.test.js tests/composer-tray-ui-contract.test.js tests/composer-mention-parity-contract.test.js tests/mobile-composer-tray-contract.test.js
npm run typecheck
npm run typecheck:tests
npm run test:inventory
npm test
cd ui && npm run build
wc -l ui/src/components/PromptComposer.tsx
```

> **inventory 게이트 규칙 (000 충돌 정책, A 감사 blocker #1):** 신규 테스트 추가 후 `npm run test:inventory`가 실패하면 `node scripts/classify-tests.mjs`로 `docs/migration/runtime-test-inventory.md`를 **로컬 재생성**해 게이트를 green으로 만든다. 단 재생성본에는 병렬 세션의 미커밋 테스트 파일들이 함께 실리므로 **이 파일은 phase 커밋에 포함하지 않는다**(`git add` 대상에서 제외). 최종 인벤토리 커밋 소유권은 090 이월 원장 참조.

## 활성화 시나리오 (C-ACTIVATION-GROUNDING-01)

1. **Partial local paste**: provider limit 3, tray 1개 상태에서 이미지 4개를 textarea에 paste한다. 실제 2개만 tray/tag로 추가되고 “4개 중 2개만 추가” informational toast가 보인다.
2. **Partial global paste**: textarea/input/contenteditable가 아닌 gallery 영역에 focus하고 같은 4개를 paste한다. local path와 같은 count/toast를 관찰한다.
3. **Full path**: tray가 limit에 도달한 상태에서 1개를 paste한다. 아무 항목도 추가되지 않고 기존 `refLimitTrayFull` error toast가 보인다.
4. **Enough-room path**: tray empty, limit 이하 파일을 paste한다. 전부 추가되고 partial/full toast는 나오지 않는다.
5. **Validation interaction**: 일부 accepted 파일이 store validation에서 제외되는 fixture로 paste한다. partial 문구의 `{added}`가 slice length가 아니라 실제 새 token 수인지 확인한다.
6. **Dead-tag SR**: `@Image_1` attachment를 추가하고 prompt에 tag를 둔 뒤 tray에서 제거한다. 시각 strike는 유지되고 screen reader/live-region log에 `@Image_1` unavailable 상태가 한 번 announce된다. 같은 tag 중복은 한 번만 읽힌다.
7. **Dead-tag recovery**: `@` mention으로 retired tag를 다시 연결하거나 prompt에서 제거한다. stale status text가 비워지고 반복 announcement loop가 없어야 한다.
8. **Focus ring**: mouse click textarea에서는 강제 ring이 없고, Tab으로 textarea에 진입하면 focus-ring이 명확히 보인다. light/dark theme 모두 확인한다.
9. **Mention regression**: `@` 입력 → tray attachment option이 element option보다 먼저 표시 → 선택 시 tag만 재삽입되고 tray membership이 바뀌지 않는다.

## Render-grounding 계획

- desktop `#create`와 390px mobile compose sheet 양쪽에서 paste/full/partial 분기를 실행한다.
- Toast DOM/visual에서 error styling 여부를 확인한다: full은 error, partial은 neutral informational이어야 한다.
- Accessibility pane 또는 screen-reader live region log에서 `role=status`, atomic text, duplicate suppression을 확인한다.
- keyboard Tab 및 mouse click을 번갈아 사용해 computed `box-shadow`가 `none` ↔ `0 0 0 2px var(--focus-ring)`으로 갈리는지 관찰한다.
- toolbar를 desktop/sidebar와 mobile sheet에서 각각 열어 attach, continue, video, direct, web search, save popover, storyboard controls가 extraction 전과 같은 순서/상태인지 smoke한다.

## 완료 기준 체크리스트

- [ ] local/global partial paste가 실제 `{added}` count를 neutral toast로 알린다.
- [ ] full/no-image/enough-room 기존 동작이 유지된다.
- [ ] `storeUIImpl.ts`를 수정하지 않고 기존 `showToast`를 재사용한다.
- [ ] dead tag visual overlay와 unique polite live status가 함께 동작한다.
- [ ] keyboard focus-visible ring이 복원되고 mouse focus 스타일은 유지된다.
- [ ] `PromptComposer.tsx`가 500줄 이하이며 신규 파일도 각각 500줄 이하이다.
- [ ] paste와 toolbar만 추출했고 mention-related source/files는 건드리지 않았다.
- [ ] 기존 mention/tray/mobile contracts와 신규 feedback contract가 통과한다.
- [ ] en/ko 2개 leaf 추가가 parity를 유지하고 병렬 JSON diff를 보존한다.
- [ ] typecheck/tests/inventory/UI build/render-grounding이 통과한다.

## Write scope clean 검증

2026-07-17 10:17 KST, 허용된 read-only `git status --short -- <file>` 결과:

| 계획 파일 | 상태 | 구현 정책 |
|---|---|---|
| `ui/src/components/PromptComposer.tsx` | clean | paste/toolbar seam과 count 반환만; mention block 불가침. |
| `ui/src/components/composer/DeadTagMirror.tsx` | clean | live status sibling만 추가. |
| `ui/src/styles/progress-composer.css` | clean | focus selector 1블록만 수정. |
| `ui/src/i18n/en.json` | `M` | 병렬 수정 중; 2개 leaf 추가만. |
| `ui/src/i18n/ko.json` | `M` | 병렬 수정 중; en과 같은 2개 leaf 추가만. |
| `ui/src/components/composer/usePromptPaste.ts` | absent | planned NEW. |
| `ui/src/components/composer/PromptComposerToolbar.tsx` | absent | planned NEW. |
| `tests/composer-mention-parity-contract.test.js` | clean | paste source owner 경로만 조정. |
| `tests/composer-feedback-contract.test.js` | absent | planned NEW. |

참고 근거 파일 `ui/src/store/storeUIImpl.ts`는 현재 `M`이지만 계획 write scope가 아니며 수정 금지다. `ReferenceTray.tsx`는 clean이지만 역시 미수정이다. 구현 직전 planned files를 재조회하고, en/ko는 key-add-only/주변 diff 보존 정책을 다시 확인한다.
