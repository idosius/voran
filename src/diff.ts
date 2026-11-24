import { diffWordsWithSpace } from 'diff';

export type DiffSegmentKind = 'add' | 'remove' | 'equal';

export interface DiffSegment {
  readonly kind: DiffSegmentKind;
  readonly text: string;
}

/**
Word-level inline diff of two texts. Empty when the texts are identical.
Concatenating the `equal` and `remove` segments yields the original; `equal` and `add` yield the fixed text.
*/
export function inlineDiff(original: string, fixed: string): DiffSegment[] {
  if (original === fixed) {
    return [];
  }
  return diffWordsWithSpace(original, fixed).map((part): DiffSegment => ({
    kind: part.added ? 'add' : part.removed ? 'remove' : 'equal',
    text: part.value,
  }));
}
