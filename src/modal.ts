import { type DiffSegment, inlineDiff } from './diff';
import { isChangedSegment, type Segment } from './messages';

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
  border: 1px solid color-mix(in srgb, CanvasText 30%, transparent);
  box-shadow: 0 0 0 1px light-dark(rgb(0 0 0 / 12%), rgb(255 255 255 / 22%)), 0 10px 40px rgb(0 0 0 / 35%);
}
.dialog:focus { outline: none; }
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
.change { border-radius: 3px; cursor: help; }
.change:hover, .change:focus-visible {
  outline: 2px solid color-mix(in srgb, CanvasText 45%, transparent); outline-offset: 1px;
}
.tooltip {
  position: fixed; z-index: 1; max-width: min(320px, calc(100vw - 16px)); pointer-events: none;
  padding: 6px 10px; border-radius: 6px; font: 13px/1.4 system-ui, sans-serif;
  background: #202124; color: #fff; box-shadow: 0 4px 16px rgb(0 0 0 / 35%);
}
.tooltip[hidden] { display: none; }
.message { margin: 0; }
.error { color: light-dark(#b42318, #ff8a80); }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
button {
  padding: 6px 14px; border-radius: 6px; font: inherit; cursor: pointer;
  border: 1px solid color-mix(in srgb, CanvasText 30%, transparent);
  background: ButtonFace; color: ButtonText;
}
button:hover { background: color-mix(in srgb, ButtonFace 85%, CanvasText); }
button:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; }
button.primary {
  padding: 8px 18px; font-weight: 600;
  background: #1a73e8; border-color: #1a73e8; color: #fff;
}
button.primary:hover { background: #1765cc; border-color: #1765cc; }
button.apply::before { content: '\\2713'; margin-right: 6px; }
.pending::before {
  content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 8px;
  border: 2px solid #fff; border-right-color: transparent; border-radius: 50%;
  vertical-align: -1px; animation: spin 0.8s linear infinite;
}
.approval {
  position: fixed; z-index: 2147483647; pointer-events: none;
  display: grid; place-items: center; width: 28px; height: 28px;
  border-radius: 50%; background: #1e8e3e; color: #fff;
  font: 700 16px system-ui, sans-serif; box-shadow: 0 4px 16px rgb(0 0 0 / 30%);
  animation: approve 1.6s ease-out forwards;
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

// 'apply' only when the user chose to apply the correction; any other dismissal is 'cancel'.
export type CloseReason = 'apply' | 'cancel';

export interface Modal {
  // Resolves with how the user dismissed the dialog.
  readonly closed: Promise<CloseReason>;
  // `segments` carry the reason per correction; without them only the plain diff is shown.
  showResult: (original: string, fixed: string, segments: readonly Segment[]) => void;
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
  container.dir = 'auto';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Corrected text');
  for (const segment of segments) {
    container.append(el(doc, SEGMENT_TAG[segment.kind], segment.kind, visibleText(segment)));
  }
  return container;
}

function renderSegments(doc: Document, segments: readonly Segment[]): HTMLElement {
  const container = el(doc, 'div', 'diff');
  container.dir = 'auto';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Corrected text');
  for (const segment of segments) {
    if (!isChangedSegment(segment)) {
      container.append(el(doc, 'span', 'equal', segment.text));
      continue;
    }
    const change = el(doc, 'span', 'change');
    change.tabIndex = 0;
    change.setAttribute('role', 'group');
    change.setAttribute('aria-label', `Correction: ${segment.original} → ${segment.fixed}`);
    change.dataset['reason'] = segment.reason;
    if (segment.original !== '') {
      const text = visibleText({ kind: 'remove', text: segment.original });
      change.append(el(doc, 'del', 'remove', text));
    }
    if (segment.fixed !== '') {
      change.append(el(doc, 'ins', 'add', visibleText({ kind: 'add', text: segment.fixed })));
    }
    container.append(change);
  }
  return container;
}

const TOOLTIP_GAP_PX = 6;
const TOOLTIP_EDGE_PX = 8;

/**
One shared tooltip for every correction. It is `position: fixed` so the dialog's scroll clipping cannot cut it off.
*/
function attachTooltip(doc: Document, tooltip: HTMLElement, diff: HTMLElement): void {
  let current: HTMLElement | undefined;

  const hide = (): void => {
    current?.removeAttribute('aria-describedby');
    current = undefined;
    tooltip.hidden = true;
  };
  const show = (change: HTMLElement): void => {
    if (change === current) {
      return;
    }
    hide();
    current = change;
    tooltip.textContent = change.dataset['reason'] ?? '';
    tooltip.dir = 'auto';
    tooltip.hidden = false;
    change.setAttribute('aria-describedby', tooltip.id);

    const rect = change.getBoundingClientRect();
    const viewWidth = doc.defaultView?.innerWidth ?? 0;
    const { offsetWidth: width, offsetHeight: height } = tooltip;
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(TOOLTIP_EDGE_PX, Math.min(centred, viewWidth - width - TOOLTIP_EDGE_PX));
    const above = rect.top - height - TOOLTIP_GAP_PX;
    tooltip.style.left = `${String(left)}px`;
    tooltip.style.top = `${String(above >= TOOLTIP_EDGE_PX ? above : rect.bottom + TOOLTIP_GAP_PX)}px`;
  };
  const changeAt = (event: Event): HTMLElement | null =>
    event.target instanceof Element ? event.target.closest<HTMLElement>('.change') : null;

  const onEnter = (event: Event): void => {
    const change = changeAt(event);
    if (change === null) {
      hide();
    } else {
      show(change);
    }
  };
  diff.addEventListener('mouseover', onEnter);
  diff.addEventListener('focusin', onEnter);
  diff.addEventListener('mouseleave', hide);
  diff.addEventListener('focusout', hide);
}

/**
Whether a keydown is a bare Enter typed inside the dialog, away from anything that handles Enter
itself: buttons click natively and a correction is only focused to read its reason. Enter while
composing (IME), held down, or with a modifier is never treated as "apply".
*/
function isPlainEnterInDialog(event: KeyboardEvent, dialog: HTMLElement): boolean {
  if (
    event.key !== 'Enter' ||
    event.isComposing ||
    event.repeat ||
    event.shiftKey ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  ) {
    return false;
  }
  const [origin] = event.composedPath();
  return (
    origin instanceof Element &&
    dialog.contains(origin) &&
    !(origin instanceof HTMLButtonElement) &&
    origin.closest('.change') === null
  );
}

export function createModal(doc: Document): Modal {
  const { host, root } = mountHost(doc);
  const backdrop = el(doc, 'div', 'backdrop');
  backdrop.setAttribute('role', 'presentation');
  const dialog = el(doc, 'div', 'dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Voran');
  // Focusable so a click on the dialog's text keeps keyboard focus (and Enter) inside it.
  dialog.tabIndex = -1;
  const tooltip = el(doc, 'div', 'tooltip');
  tooltip.id = 'voran-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  backdrop.append(dialog, tooltip);
  root.append(backdrop);

  const { promise: closed, resolve: resolveClosed } = Promise.withResolvers<CloseReason>();
  // True while a correction is shown, so Enter applies it.
  let applyOnEnter = false;

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close('cancel');
      return;
    }
    if (!applyOnEnter || !isPlainEnterInDialog(event, dialog)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    close('apply');
  };
  function close(reason: CloseReason): void {
    doc.removeEventListener('keydown', onKeydown, { capture: true });
    host.remove();
    resolveClosed(reason);
  }
  doc.addEventListener('keydown', onKeydown, { capture: true });
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) {
      close('cancel');
    }
  });

  function render(body: readonly HTMLElement[], extra?: ErrorAction, applies = false): void {
    // Only the primary button (or Enter) applies a correction; Cancel, Esc and a click outside
    // discard it.
    applyOnEnter = applies;
    const closeButton = el(
      doc,
      'button',
      applies ? 'primary apply' : 'primary',
      applies ? 'Apply correction' : 'Close',
    );
    closeButton.type = 'button';
    closeButton.addEventListener('click', () => {
      close(applies ? 'apply' : 'cancel');
    });
    const actions = el(doc, 'div', 'actions');
    if (extra !== undefined) {
      const extraButton = el(doc, 'button', undefined, extra.label);
      extraButton.addEventListener('click', extra.run);
      actions.append(extraButton);
    }
    if (applies) {
      const cancelButton = el(doc, 'button', undefined, 'Cancel');
      cancelButton.type = 'button';
      cancelButton.addEventListener('click', () => {
        close('cancel');
      });
      actions.append(cancelButton);
    }
    actions.append(closeButton);
    tooltip.hidden = true;
    dialog.replaceChildren(el(doc, 'h2', undefined, 'Voran'), ...body, actions);
    closeButton.focus();
  }

  return {
    closed,
    showResult: (original, fixed, segments): void => {
      const diff = inlineDiff(original, fixed);
      if (diff.length === 0) {
        render([el(doc, 'p', 'message', 'No corrections needed.')]);
        return;
      }
      if (segments.length === 0) {
        render([renderDiff(doc, diff)], undefined, true);
        return;
      }
      const container = renderSegments(doc, segments);
      attachTooltip(doc, tooltip, container);
      render([container], undefined, true);
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
A viewport position in CSS pixels, e.g. where the user right-clicked.
*/
export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Anchor = Pick<DOMRectReadOnly, 'top' | 'left' | 'width' | 'height'>;

const EDGE_PX = 8;
// Keeps the indicator clear of the mouse cursor.
const POINTER_OFFSET_X_PX = 12;
const POINTER_OFFSET_Y_PX = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(max, min));
}

function hasArea(at: Anchor): boolean {
  return at.width > 0 || at.height > 0;
}

/**
Non-modal "working" pill while a request is in flight. Returns a function that removes it.
Shown centred over the text when given an `Anchor`, next to the mouse for a `Point`, and in the
bottom-right corner otherwise.
*/
export function showPending(doc: Document, at?: Anchor | Point | null): () => void {
  const { host, root } = mountHost(doc);
  const pill = el(doc, 'div', 'toast pending', 'Checking…');
  pill.setAttribute('role', 'status');
  root.append(pill);
  if (at !== undefined && at !== null && (!('width' in at) || hasArea(at))) {
    const view = doc.defaultView;
    const { width, height } = pill.getBoundingClientRect();
    const [wantedLeft, wantedTop] =
      'width' in at
        ? [at.left + (at.width - width) / 2, at.top + (at.height - height) / 2]
        : [at.x + POINTER_OFFSET_X_PX, at.y + POINTER_OFFSET_Y_PX];
    const left = clamp(wantedLeft, EDGE_PX, (view?.innerWidth ?? 0) - width - EDGE_PX);
    const top = clamp(wantedTop, EDGE_PX, (view?.innerHeight ?? 0) - height - EDGE_PX);
    pill.style.pointerEvents = 'none';
    pill.style.right = 'auto';
    pill.style.bottom = 'auto';
    pill.style.left = `${String(left)}px`;
    pill.style.top = `${String(top)}px`;
  }
  return (): void => {
    host.remove();
  };
}

const APPROVAL_SIZE_PX = 28;

/**
Green checkmark for text that needs no fix. Appears centred over the checked text when given an
`Anchor`, next to the mouse for a `Point`, and in the viewport centre otherwise.
*/
export function showApproval(doc: Document, at: Anchor | Point | null, durationMs = 1600): void {
  const { host, root } = mountHost(doc);
  const badge = el(doc, 'div', 'approval', '✓');
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-label', 'Text is correct');
  root.append(badge);

  const view = doc.defaultView;
  const viewWidth = view?.innerWidth ?? 0;
  const viewHeight = view?.innerHeight ?? 0;
  const half = APPROVAL_SIZE_PX / 2;
  let centreX = viewWidth / 2;
  let top = viewHeight / 2;
  if (at !== null && !('width' in at)) {
    centreX = at.x + POINTER_OFFSET_X_PX + half;
    top = at.y + POINTER_OFFSET_Y_PX;
  } else if (at !== null && hasArea(at)) {
    centreX = at.left + at.width / 2;
    top = at.top + (at.height - APPROVAL_SIZE_PX) / 2;
  }
  // translate(-50%) in the animation centres the badge on `left`; keep that centre on screen.
  badge.style.left = `${String(clamp(centreX, EDGE_PX + half, viewWidth - EDGE_PX - half))}px`;
  badge.style.top = `${String(clamp(top, EDGE_PX, viewHeight - APPROVAL_SIZE_PX - EDGE_PX))}px`;
  badge.style.transformOrigin = 'center';
  setTimeout(() => {
    host.remove();
  }, durationMs);
}
