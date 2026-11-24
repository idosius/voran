import { describe, expect, it } from 'vitest';
import { type DiffSegment, inlineDiff } from '../src/diff';

function rebuild(segments: readonly DiffSegment[], skip: 'add' | 'remove'): string {
  return segments
    .filter((s) => s.kind !== skip)
    .map((s) => s.text)
    .join('');
}

describe('inlineDiff', () => {
  it('returns no segments for identical text', () => {
    expect(inlineDiff('Hallo Welt', 'Hallo Welt')).toEqual([]);
  });

  it('marks only the changed word, leaving punctuation as equal text', () => {
    expect(inlineDiff('Die Kinder spielt.', 'Die Kinder spielen.')).toEqual([
      { kind: 'equal', text: 'Die Kinder ' },
      { kind: 'remove', text: 'spielt' },
      { kind: 'add', text: 'spielen' },
      { kind: 'equal', text: '.' },
    ]);
  });

  it('keeps line breaks inside equal segments', () => {
    expect(inlineDiff('eins\nzwei\ndrei', 'eins\nzwie\ndrei')).toEqual([
      { kind: 'equal', text: 'eins\n' },
      { kind: 'remove', text: 'zwei' },
      { kind: 'add', text: 'zwie' },
      { kind: 'equal', text: '\ndrei' },
    ]);
  });

  it('shows whitespace-only changes', () => {
    expect(inlineDiff('a  b', 'a b').some((s) => s.kind !== 'equal')).toBe(true);
  });

  it.each([
    ['Das ist Müll.', 'Das ist Mull.', 'Müll', 'Mull'],
    ['Die Straße ist lang.', 'Die Strasse ist lang.', 'Straße', 'Strasse'],
    ['Es ist schön.', 'Es ist schon.', 'schön', 'schon'],
  ])('replaces whole German words, not fragments: %j', (original, fixed, removed, added) => {
    const segments = inlineDiff(original, fixed).filter((s) => s.kind !== 'equal');
    expect(segments).toEqual([
      { kind: 'remove', text: removed },
      { kind: 'add', text: added },
    ]);
  });

  it.each([
    ['Ich habe gestern ein Buch gelesen.', 'Ich habe gestern ein Buch gelesen, das war gut.'],
    ['Die Kinder spielt im Garten.', 'Die Kinder spielen im Garten.'],
    ['-- Hallo', '++ Hallo!'],
    ['a\n', 'b\n'],
  ])('reconstructs both texts from the segments: %j', (original, fixed) => {
    const segments = inlineDiff(original, fixed);
    expect(rebuild(segments, 'add')).toBe(original);
    expect(rebuild(segments, 'remove')).toBe(fixed);
  });
});

describe('inlineDiff in other scripts', () => {
  it.each([
    ['Я люблю яблоки', 'Я люблю яблоко', 'яблоки', 'яблоко'],
    ['Η γάτα τρώει', 'Η γάτα τρώγει', 'τρώει', 'τρώγει'],
  ])('replaces whole words, not letters: %j', (original, fixed, removed, added) => {
    const changes = inlineDiff(original, fixed).filter((part) => part.kind !== 'equal');
    expect(changes).toEqual([
      { kind: 'remove', text: removed },
      { kind: 'add', text: added },
    ]);
  });
});

describe('inlineDiff without spaces', () => {
  it('splits Chinese text into words', () => {
    const parts = inlineDiff('我喜欢苹果和香蕉', '我喜欢橙子和香蕉');
    expect(parts.filter((part) => part.kind !== 'equal')).toEqual([
      { kind: 'remove', text: '苹果' },
      { kind: 'add', text: '橙子' },
    ]);
  });
});
