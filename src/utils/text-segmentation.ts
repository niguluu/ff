const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

export function getGraphemeSegmenter(): Intl.Segmenter {
  return graphemeSegmenter;
}

export function getWordSegmenter(): Intl.Segmenter {
  return wordSegmenter;
}

export const PUNCTUATION_REGEX = /[(){}[\]<>.,;:'"!?+\-=*/\\|&%^$#@~`]/;

export function isWhitespaceChar(char: string): boolean {
  return /\s/.test(char);
}

function graphemeBoundaries(input: string): number[] {
  const bounds: number[] = [0];
  for (const { segment, index } of graphemeSegmenter.segment(input)) {
    bounds.push(index + segment.length);
  }
  return bounds;
}

export function prevGraphemeBoundary(input: string, pos: number): number {
  if (pos <= 0) return 0;
  const bounds = graphemeBoundaries(input);
  let prev = 0;
  for (const b of bounds) {
    if (b < pos) prev = b;
    else break;
  }
  return prev;
}

export function nextGraphemeBoundary(input: string, pos: number): number {
  if (pos >= input.length) return input.length;
  const bounds = graphemeBoundaries(input);
  for (const b of bounds) {
    if (b > pos) return b;
  }
  return input.length;
}

export function firstGrapheme(str: string): string | undefined {
  if (str.length === 0) return undefined;
  const iter = graphemeSegmenter.segment(str)[Symbol.iterator]().next();
  return iter.done ? str : iter.value.segment;
}
