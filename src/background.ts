import { createFixCache } from './cache';
import {
  MENU_ID,
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_PROVIDER,
  STORAGE_KEY_REASON_LANGUAGE,
  STORAGE_KEYS_API_KEY,
} from './constants';
import { CorrectionError, fixText } from './correction';
import { normalizeSettings } from './languages';
import { type FixResponse, type StartMessage, isBackgroundRequest } from './messages';
import { PROVIDER_INFO } from './providers';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Fix text with Voran',
    contexts: ['selection'],
  });
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
  // One read, so the provider and its key always come from the same moment.
  const stored = await chrome.storage.local.get([
    ...Object.values(STORAGE_KEYS_API_KEY),
    STORAGE_KEY_LANGUAGE,
    STORAGE_KEY_REASON_LANGUAGE,
    STORAGE_KEY_PROVIDER,
  ]);
  const settings = normalizeSettings(stored);
  const apiKey = stored[STORAGE_KEYS_API_KEY[settings.provider]];
  if (typeof apiKey !== 'string' || apiKey === '') {
    return {
      ok: false,
      error: `No ${PROVIDER_INFO[settings.provider].company} API key set.`,
      noKey: true,
    };
  }
  try {
    const result = await fixCache.run(text, settings, () => fixText(text, apiKey, settings));
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof CorrectionError ? error.message : 'Unexpected error.';
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
