import { type DiffSegment, inlineDiff } from './diff';

const CSS = `
:host { all: initial; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  background: rgb(0 0 0 / 45%);
  font: 14px/1.45 system-ui, sans-serif;
  color-scheme: light dark;
}
.dialog {
  box-sizing: border-box; width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
  display: flex; flex-direction: column; gap: 12px; padding: 16px 20px;
  overflow: auto; border-radius: 10px;
  background: Canvas; color: CanvasText;
  box-shadow: 0 10px 40px rgb(0 0 0 / 35%);
}
h2 { margin: 0; font-size: 16px; }
.diff {
  margin: 0; padding: 10px 12px; overflow: auto; border-radius: 6px;
  border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
  font: 14px/1.6 system-ui, sans-serif; white-space: pre-wrap; overflow-wrap: anywhere;
}
.add {
  background: rgb(46 160 67 / 25%); color: light-dark(#1a7f37, #7ee787);
  text-decoration: underline;
}
.remove {
  background: rgb(248 81 73 / 25%); color: light-dark(#b42318, #ff8a80);
  text-decoration: line-through;
}
ul { margin: 0; padding-left: 20px; }
li { margin: 2px 0; }
.message { margin: 0; }
.error { color: light-dark(#b42318, #ff8a80); }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
button {
  padding: 6px 14px; border-radius: 6px; font: inherit; cursor: pointer;
  border: 1px solid color-mix(in srgb, CanvasText 30%, transparent);
  background: ButtonFace; color: ButtonText;
}
button.primary { background: #1a73e8; border-color: #1a73e8; color: #fff; }
.pending::before {
  content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 8px;
  border: 2px solid #fff; border-right-color: transparent; border-radius: 50%;
  vertical-align: -1px; animation: spin 0.8s linear infinite;
}
.approval {
  position: fixed; z-index: 2147483647; pointer-events: none;
  display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 8px;
  border-radius: 999px; background: #1e8e3e; color: #fff;
  font: 600 14px system-ui, sans-serif; box-shadow: 0 4px 16px rgb(0 0 0 / 30%);
  animation: approve 1.6s ease-out forwards;
}
.approval .check {
  display: grid; place-items: center; width: 22px; height: 22px;
  border-radius: 50%; background: #fff; color: #1e8e3e; font-size: 14px;
}
@keyframes approve {
  0% { opacity: 0; transform: translate(-50%, 6px); }
  15%, 75% { opacity: 1; transform: translate(-50%, 0); }
  100% { opacity: 0; transform: translate(-50%, -6px); }
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .pending::before { animation: none; }
  .approval { animation: approve-static 1.6s steps(1) forwards; }
  @keyframes approve-static { 0%, 90% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 0); } }
}
.toast {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  padding: 10px 14px; border-radius: 8px; font: 14px system-ui, sans-serif;
  background: #202124; color: #fff; box-shadow: 0 4px 16px rgb(0 0 0 / 35%);
}
`;

export interface ErrorAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Modal {
  // Resolves once the user dismisses the dialog.
  readonly closed: Promise<void>;
  showResult: (original: string, fixed: string, notes: readonly string[]) => void;
  showError: (message: string, action?: ErrorAction) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className !== undefined) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function mountHost(doc: Document): { host: HTMLElement; root: ShadowRoot } {
  const host = doc.createElement('voran-root');
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  root.append(style);
  doc.documentElement.append(host);
  return { host, root };
}

const VISIBLE_WHITESPACE: Readonly<Record<string, string>> = {
  ' ': '·',
  '\t': '→',
  '\r': '␍',
  '\n': '↵\n',
};

/**
Whitespace-only changes would otherwise be invisible, so show them as glyphs.
*/
function visibleText(segment: DiffSegment): string {
  return segment.kind === 'equal' || segment.text.trim() !== ''
    ? segment.text
    : segment.text.replaceAll(/[ \t\r\n]/gu, (char) => VISIBLE_WHITESPACE[char] ?? char);
}

const SEGMENT_TAG = { add: 'ins', remove: 'del', equal: 'span' } as const;

function renderDiff(doc: Document, segments: readonly DiffSegment[]): HTMLElement {
  const container = el(doc, 'div', 'diff');
  for (const segment of segments) {
    container.append(el(doc, SEGMENT_TAG[segment.kind], segment.kind, visibleText(segment)));
  }
  return container;
}

export function createModal(doc: Document): Modal {
  const { host, root } = mountHost(doc);
  const backdrop = el(doc, 'div', 'backdrop');
  const dialog = el(doc, 'div', 'dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Voran');
  backdrop.append(dialog);
  root.append(backdrop);

  const { promise: closed, resolve: resolveClosed } = Promise.withResolvers<undefined>();

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') {
      return;
    }
    event.stopPropagation();
    close();
  };
  function close(): void {
    doc.removeEventListener('keydown', onKeydown, { capture: true });
    host.remove();
    resolveClosed(undefined);
  }
  doc.addEventListener('keydown', onKeydown, { capture: true });
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  function render(body: readonly HTMLElement[], extra?: ErrorAction): void {
    const closeButton = el(doc, 'button', 'primary', 'Close');
    closeButton.addEventListener('click', close);
    const actions = el(doc, 'div', 'actions');
    if (extra !== undefined) {
      const extraButton = el(doc, 'button', undefined, extra.label);
      extraButton.addEventListener('click', extra.run);
      actions.append(extraButton);
    }
    actions.append(closeButton);
    dialog.replaceChildren(el(doc, 'h2', undefined, 'Voran'), ...body, actions);
    closeButton.focus();
  }

  return {
    closed,
    showResult: (original, fixed, notes): void => {
      const segments = inlineDiff(original, fixed);
      if (segments.length === 0) {
        render([el(doc, 'p', 'message', 'No corrections needed.')]);
        return;
      }
      const list = el(doc, 'ul');
      for (const note of notes) {
        list.append(el(doc, 'li', undefined, note));
      }
      render(notes.length > 0 ? [renderDiff(doc, segments), list] : [renderDiff(doc, segments)]);
    },
    showError: (message, action): void => {
      render([el(doc, 'p', 'message error', message)], action);
    },
  };
}

export function showToast(doc: Document, message: string, durationMs = 3000): void {
  const { host, root } = mountHost(doc);
  root.append(el(doc, 'div', 'toast', message));
  setTimeout(() => {
    host.remove();
  }, durationMs);
}

/**
Non-modal "working" pill while a request is in flight. Returns a function that removes it.
*/
export function showPending(doc: Document): () => void {
  const { host, root } = mountHost(doc);
  const pill = el(doc, 'div', 'toast pending', 'Checking…');
  pill.setAttribute('role', 'status');
  root.append(pill);
  return (): void => {
    host.remove();
  };
}

const APPROVAL_GAP_PX = 8;
const APPROVAL_EDGE_PX = 8;

/**
Green checkmark with "Jawohl!" hovering above the checked text, for text that needs no fix.
Falls back to the viewport centre when there is no usable anchor rectangle.
*/
export function showApproval(
  doc: Document,
  anchor: Pick<DOMRectReadOnly, 'top' | 'left' | 'width' | 'height'> | null,
  durationMs = 1600,
): void {
  const { host, root } = mountHost(doc);
  const badge = el(doc, 'div', 'approval');
  badge.setAttribute('role', 'status');
  badge.append(el(doc, 'span', 'check', '✓'), el(doc, 'span', undefined, 'Jawohl!'));
  root.append(badge);

  const view = doc.defaultView;
  const viewWidth = view?.innerWidth ?? 0;
  const viewHeight = view?.innerHeight ?? 0;
  const hasAnchor = anchor !== null && (anchor.width > 0 || anchor.height > 0);
  const centreX = hasAnchor ? anchor.left + anchor.width / 2 : viewWidth / 2;
  const top = hasAnchor ? anchor.top - APPROVAL_GAP_PX : viewHeight / 2;
  // translate(-50%) in the animation centres the badge on `left`; keep that centre on screen.
  const left = Math.min(Math.max(centreX, APPROVAL_EDGE_PX + 60), Math.max(viewWidth - 60, 60));
  badge.style.left = `${String(left)}px`;
  badge.style.top = `${String(Math.max(top, APPROVAL_EDGE_PX))}px`;
  badge.style.transformOrigin = 'center';
  setTimeout(() => {
    host.remove();
  }, durationMs);
}
