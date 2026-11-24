import { describe, expect, it } from 'vitest';
import { unifiedDiff } from '../src/diff';

describe('unifiedDiff', () => {
  it('returns no lines for identical text', () => {
    expect(unifiedDiff('Hallo Welt', 'Hallo Welt')).toEqual([]);
  });

  it('marks removed and added lines', () => {
    const lines = unifiedDiff('Die Kinder spielt.', 'Die Kinder spielen.');
    expect(lines.map((l) => l.kind)).toEqual(['header', 'header', 'hunk', 'remove', 'add']);
    expect(lines.find((l) => l.kind === 'remove')?.text).toBe('-Die Kinder spielt.');
    expect(lines.find((l) => l.kind === 'add')?.text).toBe('+Die Kinder spielen.');
  });

  it('keeps unchanged lines as context and emits no newline marker', () => {
    const lines = unifiedDiff('eins\nzwei\ndrei', 'eins\nzwie\ndrei');
    expect(lines.filter((l) => l.kind === 'context').map((l) => l.text)).toEqual([
      ' eins',
      ' drei',
    ]);
    expect(lines.some((l) => l.text.includes('No newline'))).toBe(false);
  });

  it('handles texts that already end with a newline', () => {
    const lines = unifiedDiff('a\n', 'b\n');
    expect(lines.some((l) => l.kind === 'add' && l.text === '+b')).toBe(true);
  });
});

describe('unifiedDiff header detection', () => {
  it('does not mistake content lines starting with dashes or pluses for headers', () => {
    const lines = unifiedDiff('-- Hallo', '++ Hallo!');
    expect(lines.filter((l) => l.kind === 'header').map((l) => l.text)).toEqual([
      '--- original',
      '+++ fixed',
    ]);
    expect(lines.find((l) => l.kind === 'remove')?.text).toBe('--- Hallo');
    expect(lines.find((l) => l.kind === 'add')?.text).toBe('+++ Hallo!');
  });
});
