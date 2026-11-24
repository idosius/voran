import { diffArrays } from 'diff';

export type DiffSegmentKind = 'add' | 'remove' | 'equal';

export interface DiffSegment {
  readonly kind: DiffSegmentKind;
  readonly text: string;
}

// Unicode word boundaries: whole words in every script, including those written without spaces
// (Chinese, Japanese, Thai). Whitespace and punctuation come out as their own tokens.
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'word' });

function tokenize(text: string): string[] {
  return Array.from(SEGMENTER.segment(text), (part) => part.segment);
}

/**
Word-level inline diff of two texts. Empty when the texts are identical.
Concatenating the `equal` and `remove` segments yields the original; `equal` and `add` yield the fixed text.
*/
export function inlineDiff(original: string, fixed: string): DiffSegment[] {
  if (original === fixed) {
    return [];
  }
  return diffArrays(tokenize(original), tokenize(fixed)).map((part): DiffSegment => ({
    kind: part.added ? 'add' : part.removed ? 'remove' : 'equal',
    text: part.value.join(''),
  }));
}
