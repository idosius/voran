import { createFixCache } from './cache';
import { ClaudeError, fixText } from './claude';
import {
  MENU_ID,
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_REASON_LANGUAGE,
} from './constants';
import { normalizeSettings } from './languages';
import { type FixResponse, type StartMessage, isBackgroundRequest } from './messages';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: 'Voran', contexts: ['selection'] });
});

async function sendStart(tabId: number, frameId: number, message: StartMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message, { frameId });
  } catch (error) {
    // Only a missing content script (tab predates install) warrants injection.
    if (!(error instanceof Error) || !error.message.includes('Receiving end does not exist')) {
      throw error;
    }
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ['content.js'],
    });
    await chrome.tabs.sendMessage(tabId, message, { frameId });
  }
}

async function startCorrection(
  tabId: number,
  frameId: number,
  selectionText: string,
): Promise<void> {
  try {
    await sendStart(tabId, frameId, { type: 'voran:start', selectionText });
  } catch {
    // Restricted page (chrome://, Web Store, ...): the content script cannot run there.
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || tab?.id === undefined) {
    return;
  }
  void startCorrection(tab.id, info.frameId ?? 0, info.selectionText ?? '');
});

// Session storage outlives the service worker, which Chrome stops when idle, and is cleared when the
// browser closes.
const fixCache = createFixCache(chrome.storage.session);

async function handleFix(text: string): Promise<FixResponse> {
  const stored = await chrome.storage.local.get([
    STORAGE_KEY_API_KEY,
    STORAGE_KEY_LANGUAGE,
    STORAGE_KEY_REASON_LANGUAGE,
  ]);
  const apiKey = stored[STORAGE_KEY_API_KEY];
  if (typeof apiKey !== 'string' || apiKey === '') {
    return { ok: false, error: 'No API key set.', noKey: true };
  }
  try {
    const settings = normalizeSettings(stored);
    const result = await fixCache.run(text, settings, () => fixText(text, apiKey, settings));
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof ClaudeError ? error.message : 'Unexpected error.';
    return { ok: false, error: message, noKey: false };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isBackgroundRequest(message)) {
    return false;
  }
  if (message.type === 'voran:open-options') {
    void chrome.runtime.openOptionsPage();
    return false;
  }
  void handleFix(message.text).then(sendResponse);
  return true;
});
