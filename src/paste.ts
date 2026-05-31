// Bracketed-paste handling, ported (as algorithms) from pi's editor paste path.
//
// Ink's `useInput` delivers a terminal paste as a single multi-character `char`
// event rather than per-keystroke events. We normalize that text and, for very
// large pastes, replace it with a compact marker that is expanded on submit so
// the editor stays readable.

const PASTE_LINE_THRESHOLD = 10;
const PASTE_CHAR_THRESHOLD = 1000;

// Bracketed-paste guards. When a terminal has bracketed paste mode enabled it
// wraps pasted text in ESC[200~ … ESC[201~. Ink's `useInput` usually strips the
// leading ESC, so the markers can leak through as the literal text `[200~` /
// `[201~`. We strip both the full escape sequences and the ESC-less remnants so
// they never end up inserted into the editor (the bug from the TODO note).
const BRACKETED_PASTE_MARKERS = /\x1b?\[20[01]~/g;

/**
 * Strip any bracketed-paste start/end markers from a chunk. Safe to call on any
 * input event, whether or not it actually came from a paste.
 */
export function stripBracketedPasteMarkers(text: string): string {
  return text.replace(BRACKETED_PASTE_MARKERS, "");
}

/** True if a chunk contains bracketed-paste markers (i.e. it is a paste). */
export function hasBracketedPasteMarkers(text: string): boolean {
  BRACKETED_PASTE_MARKERS.lastIndex = 0;
  return BRACKETED_PASTE_MARKERS.test(text);
}

/**
 * Normalize pasted text: strip bracketed-paste markers, collapse CRLF/CR to LF
 * and strip C0 control characters other than newline and tab (which terminals
 * may include).
 */
export function normalizePaste(text: string): string {
  return stripBracketedPasteMarkers(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/** Whether a paste is large enough to be collapsed into a marker. */
export function isLargePaste(text: string): boolean {
  const lines = text.split("\n").length;
  return lines > PASTE_LINE_THRESHOLD || text.length > PASTE_CHAR_THRESHOLD;
}

/**
 * Tracks large pastes that were collapsed into `[paste #N +L lines]` markers.
 * The full text is restored from the markers when the prompt is submitted.
 */
export class PasteStore {
  private map = new Map<string, string>();
  private counter = 0;

  /** Store `text`, returning the marker that should be inserted in its place. */
  add(text: string): string {
    this.counter++;
    const lines = text.split("\n").length;
    const marker = `[paste #${this.counter} +${lines} lines]`;
    this.map.set(marker, text);
    return marker;
  }

  /** Replace any known markers in `input` with their original pasted text. */
  expand(input: string): string {
    if (this.map.size === 0) return input;
    let result = input;
    for (const [marker, text] of this.map) {
      result = result.split(marker).join(text);
    }
    return result;
  }

  clear(): void {
    this.map.clear();
    this.counter = 0;
  }
}
