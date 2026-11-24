import { inlineDiff } from './diff';

export interface TextPosition {
  readonly node: Text;
  readonly offset: number;
}

export interface TextMap {
  // Plain text sent for correction.
  readonly text: string;
  // DOM position of each character of `text`; null for characters made up here (line breaks).
  readonly positions: readonly (TextPosition | null)[];
}

export interface Edit {
  readonly range: Range;
  // Text the range must still hold when the edit runs; guards against pages that re-render.
  readonly expected: string;
  readonly fixed: string;
}

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TD',
  'TH',
  'TR',
  'UL',
]);

const NBSP = '\u{A0}';
const COLLAPSIBLE = new Set([' ', '\t', '\n', '\r', '\f']);
// Zero-width space and BOM: editors use them as invisible cursor placeholders. The joiners
// (U+200C, U+200D) carry meaning in Persian, Indic scripts and emoji, so they stay.
const INVISIBLE = new Set(['\u{200B}', '\u{FEFF}']);

function blockOf(node: Node, root: Node): Element | null {
  let element = node.parentElement;
  while (element !== null && element !== root) {
    if (BLOCK_TAGS.has(element.tagName)) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function keepsWhitespace(node: Text): boolean {
  const element = node.parentElement;
  if (element === null) {
    return false;
  }
  if (element.closest('pre') !== null) {
    return true;
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element).whiteSpace ?? '';
  return style.startsWith('pre') || style === 'break-spaces';
}

/**
Plain text of a range together with where each character lives in the DOM. Block boundaries and
<br> become one line break, runs of whitespace collapse like the browser renders them, non-breaking
spaces become spaces and invisible characters disappear.
*/
export function extractText(range: Range): TextMap {
  const root = range.commonAncestorContainer;
  const chars: string[] = [];
  const positions: (TextPosition | null)[] = [];
  let previousBlock: Element | null | undefined;

  const lineBreak = (): void => {
    if (chars.length === 0 || chars.at(-1) === '\n') {
      return;
    }

    if (chars.at(-1) === ' ') {
      chars.pop();
      positions.pop();
    }
    chars.push('\n');
    positions.push(null);
  };

  const visitText = (node: Text): void => {
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.length;
    if (from >= to) {
      return;
    }
    const block = blockOf(node, root);
    if (previousBlock !== undefined && block !== previousBlock) {
      lineBreak();
    }
    previousBlock = block;
    const keep = keepsWhitespace(node);
    for (let offset = from; offset < to; offset += 1) {
      const char = node.data.charAt(offset);
      if (INVISIBLE.has(char)) {
        continue;
      }
      let out = char === NBSP ? ' ' : char;
      if (!keep && COLLAPSIBLE.has(char)) {
        if (chars.length === 0 || chars.at(-1) === ' ' || chars.at(-1) === '\n') {
          continue;
        }
        out = ' ';
      }
      chars.push(out);
      positions.push({ node, offset });
    }
  };

  if (root instanceof Text) {
    visitText(root);
  } else {
    const walker = root.ownerDocument?.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );
    for (
      let node = walker?.nextNode();
      node !== null && node !== undefined;
      node = walker?.nextNode()
    ) {
      if (!range.intersectsNode(node)) {
        continue;
      }
      if (node instanceof Text) {
        visitText(node);
      } else if (node instanceof HTMLBRElement) {
        lineBreak();
      }
    }
  }

  while (chars.length > 0 && (chars.at(-1) === '\n' || chars.at(-1) === ' ')) {
    chars.pop();
    positions.pop();
  }
  return { text: chars.join(''), positions };
}

interface Hunk {
  start: number;
  end: number;
  fixed: string;
}

function hunksOf(original: string, fixed: string): Hunk[] {
  const hunks: Hunk[] = [];
  let position = 0;
  let current: Hunk | null = null;
  for (const segment of inlineDiff(original, fixed)) {
    if (segment.kind === 'equal') {
      current = null;
      position += segment.text.length;
      continue;
    }
    if (current === null) {
      current = { start: position, end: position, fixed: '' };
      hunks.push(current);
    }
    if (segment.kind === 'remove') {
      current.end += segment.text.length;
      position += segment.text.length;
    } else {
      current.fixed += segment.text;
    }
  }
  return hunks;
}

function rangeOf(map: TextMap, hunk: Hunk): Range | null {
  const { positions } = map;
  let start: TextPosition | null | undefined;
  let end: TextPosition | null | undefined;
  if (hunk.end > hunk.start) {
    for (let index = hunk.start; index < hunk.end; index += 1) {
      if (positions[index] === null) {
        return null;
      }
    }
    start = positions[hunk.start];
    const last = positions[hunk.end - 1];
    end = last === null || last === undefined ? last : { node: last.node, offset: last.offset + 1 };
  } else {
    // Pure insertion: stay with the preceding character so the new text takes its formatting.
    const previous = hunk.start > 0 ? positions[hunk.start - 1] : null;
    start =
      previous === null || previous === undefined
        ? positions[hunk.start]
        : { node: previous.node, offset: previous.offset + 1 };
    end = start;
  }
  if (
    start === null ||
    start === undefined ||
    end === null ||
    end === undefined ||
    !start.node.isConnected ||
    !end.node.isConnected
  ) {
    return null;
  }
  const range = start.node.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

/**
Small in-place edits turning the mapped text into `fixed`, or null when that cannot be done without
touching structure (the correction crosses or adds a line break, or the DOM moved on).
*/
export function planEdits(map: TextMap, fixed: string): Edit[] | null {
  const edits: Edit[] = [];
  for (const hunk of hunksOf(map.text, fixed)) {
    if (hunk.fixed.includes('\n')) {
      return null;
    }
    const range = rangeOf(map, hunk);
    if (range === null) {
      return null;
    }
    edits.push({ range, expected: range.toString(), fixed: hunk.fixed });
  }
  return edits;
}

function editCommand(doc: Document, fixed: string): boolean {
  try {
    /* eslint-disable @typescript-eslint/no-deprecated */
    return fixed === ''
      ? doc.execCommand('delete', false)
      : doc.execCommand('insertText', false, fixed);
    /* eslint-enable @typescript-eslint/no-deprecated */
  } catch {
    return false;
  }
}

/**
Apply planned edits last to first, so earlier positions stay valid. Returns false when the page
detached the text mid-way; the caller should then stop trusting the DOM.
*/
export function applyEdits(doc: Document, host: HTMLElement, edits: readonly Edit[]): boolean {
  host.focus();
  const selection = doc.getSelection();
  for (const { range, expected, fixed } of edits.toReversed()) {
    if (!range.startContainer.isConnected || range.toString() !== expected) {
      return false;
    }
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (editCommand(doc, fixed)) {
      continue;
    }

    range.deleteContents();
    if (fixed !== '') {
      range.insertNode(doc.createTextNode(fixed));
    }
    host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }
  return true;
}
