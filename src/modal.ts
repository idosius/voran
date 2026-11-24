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
  for (const segment of segments) {
    container.append(el(doc, SEGMENT_TAG[segment.kind], segment.kind, visibleText(segment)));
  }
  return container;
}

function renderSegments(doc: Document, segments: readonly Segment[]): HTMLElement {
  const container = el(doc, 'div', 'diff');
  container.dir = 'auto';
  for (const segment of segments) {
    if (!isChangedSegment(segment)) {
      container.append(el(doc, 'span', 'equal', segment.text));
      continue;
    }
    const change = el(doc, 'span', 'change');
    change.tabIndex = 0;
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

export function createModal(doc: Document): Modal {
  const { host, root } = mountHost(doc);
  const backdrop = el(doc, 'div', 'backdrop');
  const dialog = el(doc, 'div', 'dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Voran');
  const tooltip = el(doc, 'div', 'tooltip');
  tooltip.id = 'voran-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  backdrop.append(dialog, tooltip);
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
        render([renderDiff(doc, diff)]);
        return;
      }
      const container = renderSegments(doc, segments);
      attachTooltip(doc, tooltip, container);
      render([container]);
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
