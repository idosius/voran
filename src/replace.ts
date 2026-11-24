export type Target =
  | {
      readonly kind: 'field';
      readonly element: HTMLInputElement | HTMLTextAreaElement;
      readonly start: number;
      readonly end: number;
      readonly original: string;
    }
  | {
      readonly kind: 'editable';
      readonly range: Range;
      // Selection text sent for correction; keeps line breaks.
      readonly original: string;
      // Plain text of the range, used to detect that the page changed meanwhile.
      readonly rangeText: string;
    }
  | { readonly kind: 'readonly'; readonly original: string };

export type ReplaceOutcome = 'replaced' | 'copied' | 'failed';

function isTextField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
}

function elementOf(node: Node | null): Element | null {
  return node instanceof Element ? node : (node?.parentElement ?? null);
}

function editableHost(node: Node | null): HTMLElement | null {
  const element = elementOf(node);
  if (!(element instanceof HTMLElement) || !element.isContentEditable) {
    return null;
  }
  let host: HTMLElement = element;
  while (host.parentElement?.isContentEditable === true) {
    host = host.parentElement;
  }
  return host;
}

/**
Snapshot the current selection so it survives focus changes caused by the modal.
*/
export function captureTarget(doc: Document): Target | null {
  const active = doc.activeElement;
  if (isTextField(active)) {
    const { selectionStart, selectionEnd } = active;
    if (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) {
      const selected = active.value.slice(selectionStart, selectionEnd);
      if (active.readOnly || active.disabled) {
        return { kind: 'readonly', original: selected };
      }
      return {
        kind: 'field',
        element: active,
        start: selectionStart,
        end: selectionEnd,
        original: selected,
      };
    }
  }

  const selection = doc.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0).cloneRange();
  const original = selection.toString();
  return editableHost(range.commonAncestorContainer) === null
    ? { kind: 'readonly', original }
    : { kind: 'editable', range, original, rangeText: range.toString() };
}

/**
document.execCommand is deprecated but is the only way to edit text while keeping the page's
undo stack and firing the events frameworks listen to. Returns false when unavailable.
*/
function tryExecCommand(doc: Document, command: string, value?: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return doc.execCommand(command, false, value);
  } catch {
    return false;
  }
}

async function copyToClipboard(doc: Document, text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const scratch = doc.createElement('textarea');
    scratch.value = text;
    doc.body.append(scratch);
    scratch.select();
    const ok = tryExecCommand(doc, 'copy');
    scratch.remove();
    return ok;
  }
}

function replaceInField(
  target: Extract<Target, { kind: 'field' }>,
  fixed: string,
): ReplaceOutcome | null {
  const { element, start, end, original } = target;
  const before = element.value;
  if (element.readOnly || element.disabled || before.slice(start, end) !== original) {
    return null;
  }
  const expected = before.slice(0, start) + fixed + before.slice(end);
  element.focus();
  element.setSelectionRange(start, end);
  // execCommand keeps the native undo stack; setRangeText is the fallback.
  const inserted = tryExecCommand(element.ownerDocument, 'insertText', fixed);
  if (!inserted || element.value !== expected) {
    element.value = before;
    element.setRangeText(fixed, start, end, 'select');
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }
  return 'replaced';
}

function replaceInEditable(
  target: Extract<Target, { kind: 'editable' }>,
  fixed: string,
): ReplaceOutcome | null {
  const { range, rangeText } = target;
  const host = editableHost(range.commonAncestorContainer);
  if (host === null || !range.startContainer.isConnected || range.toString() !== rangeText) {
    return null;
  }
  const doc = host.ownerDocument;
  host.focus();
  const selection = doc.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (!tryExecCommand(doc, 'insertText', fixed)) {
    range.deleteContents();
    range.insertNode(doc.createTextNode(fixed));
    host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }
  return 'replaced';
}

/**
Replace the captured selection in place, or copy to the clipboard when that is impossible.
*/
export async function applyReplacement(
  doc: Document,
  target: Target,
  fixed: string,
): Promise<ReplaceOutcome> {
  let outcome: ReplaceOutcome | null = null;
  if (target.kind === 'field') {
    outcome = replaceInField(target, fixed);
  } else if (target.kind === 'editable') {
    outcome = replaceInEditable(target, fixed);
  }
  if (outcome !== null) {
    return outcome;
  }
  return (await copyToClipboard(doc, fixed)) ? 'copied' : 'failed';
}

/**
Where to hover feedback for a target: the field box, or the selected text's bounding box.
*/
export function anchorRect(doc: Document, target: Target): DOMRect | null {
  switch (target.kind) {
    case 'field': {
      return target.element.getBoundingClientRect();
    }
    case 'editable': {
      return target.range.getBoundingClientRect();
    }
    case 'readonly': {
      const selection = doc.getSelection();
      return selection !== null && selection.rangeCount > 0
        ? selection.getRangeAt(0).getBoundingClientRect()
        : null;
    }
  }
}
