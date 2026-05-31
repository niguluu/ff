const PASTE_LINE_THRESHOLD = 10;
const PASTE_CHAR_THRESHOLD = 1000;

const BRACKETED_PASTE_MARKERS = /\x1b?\[20[01]~/g;

export function stripBracketedPasteMarkers(text: string): string {
  return text.replace(BRACKETED_PASTE_MARKERS, "");
}

export function hasBracketedPasteMarkers(text: string): boolean {
  BRACKETED_PASTE_MARKERS.lastIndex = 0;
  return BRACKETED_PASTE_MARKERS.test(text);
}

export function normalizePaste(text: string): string {
  return stripBracketedPasteMarkers(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

export function isLargePaste(text: string): boolean {
  const lines = text.split("\n").length;
  return lines > PASTE_LINE_THRESHOLD || text.length > PASTE_CHAR_THRESHOLD;
}

export class PasteStore {
  private map = new Map<string, string>();
  private counter = 0;

  add(text: string): string {
    this.counter++;
    const lines = text.split("\n").length;
    const marker = `[paste #${this.counter} +${lines} lines]`;
    this.map.set(marker, text);
    return marker;
  }

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
