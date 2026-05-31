# Pi Prompt Box & Scrolling Port — Status

## Summary

Cloned `pi-mono` to `vendor/pi-mono` as reference. The pi editor features (grapheme-aware editing, word navigation, kill ring, undo, paste handling, sticky-column up/down) have been ported as plain functions / React state. The prompt box layout is stable with a fixed-height container.

---

## ✅ Implemented

| Feature | Files | Status |
|---------|-------|--------|
| Grapheme-aware cursor movement | `text-segmentation.ts`, `input-editor.ts`, `use-app-input.ts` | Done — left/right arrows move by grapheme cluster |
| Grapheme-aware backspace/delete | `input-editor.ts` (`backspaceText`, `deleteForwardText`) | Done — uses `Intl.Segmenter` |
| Word navigation (Ctrl/Alt+arrows) | `word-navigation.ts`, `use-app-input.ts` | Done — `findWordBackward` / `findWordForward` |
| Kill ring (cut/yank) | `kill-ring.ts`, `input-editor.ts`, `use-app-input.ts` | Done — Ctrl+K/U/W, Alt+Backspace/D, Ctrl+Y |
| Undo stack | `undo-stack.ts`, `use-app-input.ts` | Done — Ctrl+/, Ctrl+_ |
| Sticky column for up/down | `pi-prompt-utils.ts`, `use-app-input.ts` | Done — `preferredVisualCol` preserved across visual lines |
| Bracketed paste handling | `paste.ts`, `use-app-input.ts` | Done — detects `\x1b[200~` … `\x1b[201~`, normalizes |
| Large paste markers | `paste.ts` (`PasteStore`, `isLargePaste`) | Done — pastes >10 lines or >1000 chars get markers |
| Fixed-height prompt box | `app.tsx`, `input-panel.tsx` | Done — `inputHeight = promptMaxContentHeight + 2` |
| Empty-state prompt rendering | `input-panel.tsx` | Done — empty input flows through normal `visibleLines` pipeline |
| Inverse-video cursor | `input-panel.tsx`, `message-viewport.tsx` | Done — fake cursor always rendered |
| PageUp/PageDown in prompt | `use-app-input.ts` | Done — pages prompt when it overflows |
| Copy assistant (Ctrl+O) | `use-app-input.ts` | Done — rebound from Ctrl+Y to Ctrl+O |
| Scroll indicators | `message-viewport.tsx` | Done — dimmed scroll info |
| Streaming cursor | `message-viewport.tsx` | Done — inverse-video streaming cursor |

---

## 🔴 Known Issues

### 1. Streaming Responses Can Cause Layout Shift
**File:** `src/app.tsx`, `src/message-viewport.tsx`
**Issue:** When `streamingText` changes rapidly, `MessageViewport` height can fluctuate, causing the message area to jump. The `inputHeight` is now fixed, but the message viewport itself may still resize.
**Mitigation:** The fixed input height helps, but the viewport's `useMemo` depends on `msgAreaHeight` which is stable. The remaining issue is scroll position snapping during streaming.

### 2. Scroll Position During Streaming
**File:** `src/app.tsx`
**Issue:** `shouldAutoScroll(scrollLines <= 1)` snaps to bottom on every chunk. If user has scrolled up, the next chunk may fight with their scroll position.
**Mitigation:** Current logic is acceptable for most use cases; improvement would require tracking user scroll intent.

---

## 🟡 Future Improvements

- **Smooth scroll follow** — only auto-scroll when user is at bottom; stop if user has scrolled up.
- **IME composition handling** — the `CURSOR_MARKER` APC sequence is emitted but IME integration is untested.
- **Multi-line paste marker expansion** — paste markers are collapsed in the editor but expanded on submit; the expansion logic works but could be more robust.

---

## 📁 Reference

Pi source in `vendor/pi-mono` (local reference only, in `.gitignore`):

| Pi File | What Was Extracted |
|---------|-------------------|
| `packages/tui/src/components/editor.ts` | Grapheme backspace, sticky column, paste handling |
| `packages/tui/src/utils.ts` | `getGraphemeSegmenter`, `visibleWidth` |
| `packages/tui/src/word-navigation.ts` | `findWordBackward`, `findWordForward` |
| `packages/tui/src/kill-ring.ts` | `KillRing` class |
| `packages/tui/src/undo-stack.ts` | `UndoStack` class |

---

## Notes

- Pi's component model (`render(width): string[]`) is fundamentally different from Ink's React model. Algorithms were extracted, not components.
- `vendor/pi-mono` is a local reference only and is not distributed.
