import { createTwoFilesPatch } from 'diff';

export type DiffLineKind = 'header' | 'hunk' | 'add' | 'remove' | 'context';

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

function withTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function classify(line: string): DiffLineKind {
  if (line.startsWith('@@')) {
    return 'hunk';
  }
  if (line.startsWith('+')) {
    return 'add';
  }
  if (line.startsWith('-')) {
    return 'remove';
  }
  return 'context';
}

/**
Unified diff of two texts as classified lines. Empty when the texts are identical.
*/
export function unifiedDiff(original: string, fixed: string): DiffLine[] {
  if (original === fixed) {
    return [];
  }
  const patch = createTwoFilesPatch(
    'original',
    'fixed',
    withTrailingNewline(original),
    withTrailingNewline(fixed),
    '',
    '',
    { context: 3 },
  );
  const lines = patch.split('\n').filter((line) => line !== '');
  // Everything before the first hunk is file header; judge by position, not by prefix, so that
  // content lines such as '-- foo' (rendered '--- foo') are not mistaken for headers.
  const firstHunk = lines.findIndex((line) => line.startsWith('@@'));
  return lines
    .map((line, index): DiffLine => ({
      kind: index < firstHunk ? 'header' : classify(line),
      text: line,
    }))
    .filter((line) => !line.text.startsWith('==='));
}
