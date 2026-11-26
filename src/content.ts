import { MAX_INPUT_CHARS } from './constants';
import { type BackgroundRequest, type FixResponse, isStartMessage } from './messages';
import {
  createModal,
  type Anchor,
  type ErrorAction,
  type Point,
  showApproval,
  showPending,
  showToast,
} from './modal';
import { anchorRect, applyReplacement, captureTarget, type Target } from './replace';

const LOADED_FLAG = '__voranLoaded';

async function requestFix(text: string): Promise<FixResponse> {
  const request: BackgroundRequest = { type: 'voran:fix', text };
  try {
    return await chrome.runtime.sendMessage<BackgroundRequest, FixResponse>(request);
  } catch {
    return {
      ok: false,
      error: 'Extension was reloaded. Reload this page and try again.',
      noKey: false,
    };
  }
}

async function openOptions(): Promise<void> {
  const request: BackgroundRequest = { type: 'voran:open-options' };
  try {
    await chrome.runtime.sendMessage(request);
  } catch {
    // Extension context is gone; nothing to do.
  }
}

async function showErrorModal(message: string, action?: ErrorAction): Promise<void> {
  const modal = createModal(document);
  modal.showError(message, action);
  await modal.closed;
}

// Status feedback is drawn over the selected text; the mouse position is the fallback when the
// selection has no usable box (e.g. it was cleared while waiting).
function statusSpot(target: Target, point: Point | null): Anchor | Point | null {
  const rect = anchorRect(document, target);
  return rect !== null && (rect.width > 0 || rect.height > 0) ? rect : point;
}

async function run(
  selectionText: string,
  captured: Target | null,
  point: Point | null,
): Promise<void> {
  const target: Target =
    captured === null || captured.original.trim() === ''
      ? { kind: 'readonly', original: selectionText }
      : captured;

  if (target.original.length > MAX_INPUT_CHARS) {
    await showErrorModal(`Selection too long (max ${String(MAX_INPUT_CHARS)} characters).`);
    return;
  }

  const dismissPending = showPending(document, statusSpot(target, point));
  const response = await requestFix(target.original);
  dismissPending();
  if (!response.ok) {
    await showErrorModal(
      response.error,
      response.noKey
        ? {
            label: 'Open options',
            run: (): void => {
              void openOptions();
            },
          }
        : undefined,
    );
    return;
  }

  const { fixed, segments, language: detected } = response.result;
  if (fixed === target.original) {
    showApproval(document, statusSpot(target, point));
    return;
  }

  const modal = createModal(document);
  modal.showResult(target.original, fixed, segments, detected);
  if ((await modal.closed) !== 'apply') {
    return;
  }

  const outcome = await applyReplacement(document, target, fixed);
  if (outcome === 'copied') {
    showToast(document, 'Corrected text copied to clipboard.');
  } else if (outcome === 'failed') {
    showToast(document, 'Could not replace the text.');
  }
}

function init(): void {
  const state: { target: Target | null; point: Point | null } = { target: null, point: null };

  // The selection must be captured at right-click time: opening the modal steals focus.
  document.addEventListener(
    'contextmenu',
    (event) => {
      state.target = captureTarget(document);
      state.point = { x: event.clientX, y: event.clientY };
    },
    { capture: true },
  );

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!isStartMessage(message)) {
      return;
    }
    const captured = state.target ?? captureTarget(document);
    const point = state.point;
    state.target = null;
    state.point = null;
    void run(message.selectionText, captured, point);
  });
}

// The background worker may inject this script into a tab that already has it.
if (Reflect.get(globalThis, LOADED_FLAG) !== true) {
  Reflect.set(globalThis, LOADED_FLAG, true);
  init();
}
