import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anchorRect, applyReplacement, captureTarget, type Target } from '../src/replace';

function selectRange(node: Node, start: number, end: number): void {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('captureTarget', () => {
  it('returns null without a selection', () => {
    document.getSelection()?.removeAllRanges();
    expect(captureTarget(document)).toBeNull();
  });

  it('captures a textarea selection', () => {
    const area = document.createElement('textarea');
    area.value = 'Ich bin müde Hund';
    document.body.append(area);
    area.focus();
    area.setSelectionRange(4, 7);
    expect(captureTarget(document)).toMatchObject({
      kind: 'field',
      start: 4,
      end: 7,
      original: 'bin',
    });
  });

  it('ignores a collapsed field selection', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(captureTarget(document)).toBeNull();
  });

  it('captures read-only page text', () => {
    const p = document.createElement('p');
    p.textContent = 'Hallo Welt';
    document.body.append(p);
    selectRange(p.firstChild!, 0, 5);
    expect(captureTarget(document)).toMatchObject({ kind: 'readonly', original: 'Hallo' });
  });

  it('captures contenteditable text', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.textContent = 'Hallo Welt';
    document.body.append(div);
    selectRange(div.firstChild!, 0, 5);
    expect(captureTarget(document)).toMatchObject({ kind: 'editable', original: 'Hallo' });
  });
});

describe('applyReplacement', () => {
  it('replaces inside a textarea and fires input', async () => {
    const area = document.createElement('textarea');
    area.value = 'Die Kinder spielt im Garten';
    document.body.append(area);
    const onInput = vi.fn();
    area.addEventListener('input', onInput);
    const target: Target = {
      kind: 'field',
      element: area,
      start: 4,
      end: 17,
      original: 'Kinder spielt',
    };
    expect(await applyReplacement(document, target, 'Kinder spielen')).toBe('replaced');
    expect(area.value).toBe('Die Kinder spielen im Garten');
    expect(onInput).toHaveBeenCalled();
  });

  it('falls back to the clipboard when the field changed meanwhile', async () => {
    const area = document.createElement('textarea');
    area.value = 'ganz anderer Text';
    document.body.append(area);
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const target: Target = { kind: 'field', element: area, start: 0, end: 3, original: 'xyz' };
    expect(await applyReplacement(document, target, 'fix')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('fix');
    expect(area.value).toBe('ganz anderer Text');
    vi.unstubAllGlobals();
  });

  it('replaces contenteditable text', async () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.textContent = 'Ich habe ein Fehler';
    document.body.append(div);
    selectRange(div.firstChild!, 9, 19);
    const target = captureTarget(document);
    expect(target?.kind).toBe('editable');
    expect(await applyReplacement(document, target!, 'einen Fehler')).toBe('replaced');
    expect(div.textContent).toBe('Ich habe einen Fehler');
  });

  it('copies when the editable range text no longer matches', async () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.textContent = 'Hallo Welt';
    document.body.append(div);
    selectRange(div.firstChild!, 0, 5);
    const target = captureTarget(document)!;
    div.textContent = 'Anderer Text';
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await applyReplacement(document, target, 'Hallo!')).toBe('copied');
    vi.unstubAllGlobals();
  });

  it('copies read-only text to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await applyReplacement(document, { kind: 'readonly', original: 'a' }, 'b')).toBe(
      'copied',
    );
    expect(writeText).toHaveBeenCalledWith('b');
    vi.unstubAllGlobals();
  });

  it('uses the execCommand copy fallback, and reports failure', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    });
    const exec = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    const target: Target = { kind: 'readonly', original: 'a' };
    expect(await applyReplacement(document, target, 'b')).toBe('copied');
    expect(await applyReplacement(document, target, 'b')).toBe('failed');
    expect(exec).toHaveBeenCalledWith('copy', false, undefined);
    Reflect.deleteProperty(document, 'execCommand');
    vi.unstubAllGlobals();
  });

  it('prefers execCommand for textareas and keeps the result', async () => {
    const area = document.createElement('textarea');
    area.value = 'ab cd';
    document.body.append(area);
    const exec = vi.fn(() => {
      area.value = 'AB cd';
      return true;
    });
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    const target: Target = { kind: 'field', element: area, start: 0, end: 2, original: 'ab' };
    expect(await applyReplacement(document, target, 'AB')).toBe('replaced');
    expect(exec).toHaveBeenCalledWith('insertText', false, 'AB');
    expect(area.value).toBe('AB cd');
    Reflect.deleteProperty(document, 'execCommand');
  });
});

describe('read-only and disabled fields', () => {
  it.each(['readOnly', 'disabled'] as const)('captures a %s textarea as read-only text', (flag) => {
    const area = document.createElement('textarea');
    area.value = 'Ich bin müde';
    document.body.append(area);
    area.focus();
    area.setSelectionRange(0, 3);
    area[flag] = true;
    // Disabled elements lose focus semantics; focus again where the platform allows it.
    Object.defineProperty(document, 'activeElement', { value: area, configurable: true });
    expect(captureTarget(document)).toEqual({ kind: 'readonly', original: 'Ich' });
    Reflect.deleteProperty(document, 'activeElement');
  });

  it('copies instead of writing when the field became read-only', async () => {
    const area = document.createElement('textarea');
    area.value = 'Ich bin';
    area.readOnly = true;
    document.body.append(area);
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const target: Target = { kind: 'field', element: area, start: 0, end: 3, original: 'Ich' };
    expect(await applyReplacement(document, target, 'Ich!')).toBe('copied');
    expect(area.value).toBe('Ich bin');
    vi.unstubAllGlobals();
  });
});

describe('multi-line contenteditable selections', () => {
  it('replaces when the selection text contains line breaks the range text lacks', async () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    const first = document.createElement('p');
    first.textContent = 'Ein Satz';
    const second = document.createElement('p');
    second.textContent = 'Zwei Satz';
    div.append(first, second);
    document.body.append(div);
    const range = document.createRange();
    range.setStart(first.firstChild!, 0);
    range.setEnd(second.firstChild!, 9);
    const target: Target = {
      kind: 'editable',
      range,
      original: 'Ein Satz\nZwei Satz',
      rangeText: range.toString(),
    };
    expect(await applyReplacement(document, target, 'Ein Satz. Zwei Sätze.')).toBe('replaced');
    expect(div.textContent).toContain('Zwei Sätze.');
  });
});

describe('anchorRect', () => {
  it('uses the field box for fields', () => {
    const area = document.createElement('textarea');
    document.body.append(area);
    const rect = new DOMRect(1, 2, 3, 4);
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(rect);
    expect(
      anchorRect(document, { kind: 'field', element: area, start: 0, end: 1, original: 'a' }),
    ).toBe(rect);
  });

  it('uses the range box for editable text', () => {
    const range = document.createRange();
    const rect = new DOMRect(5, 6, 7, 8);
    vi.spyOn(range, 'getBoundingClientRect').mockReturnValue(rect);
    expect(anchorRect(document, { kind: 'editable', range, original: 'a', rangeText: 'a' })).toBe(
      rect,
    );
  });

  it('uses the live selection for read-only text, or null without one', () => {
    const p = document.createElement('p');
    p.textContent = 'Hallo';
    document.body.append(p);
    selectRange(p.firstChild!, 0, 3);
    expect(anchorRect(document, { kind: 'readonly', original: 'Hal' })).not.toBeNull();
    document.getSelection()?.removeAllRanges();
    expect(anchorRect(document, { kind: 'readonly', original: 'Hal' })).toBeNull();
  });
});
