import { attachCombobox } from './combobox';
import {
  STORAGE_KEYS_API_KEY,
  STORAGE_KEY_LANGUAGE,
  STORAGE_KEY_PROVIDER,
  STORAGE_KEY_REASON_LANGUAGE,
} from './constants';
import {
  AUTO_LABEL,
  AUTO_LANGUAGE,
  DEFAULT_SETTINGS,
  LANGUAGES,
  SAME_LABEL,
  SAME_LANGUAGE,
  languageFromLabel,
  languageLabel,
  normalizeSettings,
} from './languages';
import { hasApiAccess, requestApiAccess } from './permissions';
import {
  DEFAULT_PROVIDER,
  isProviderId,
  PROVIDER_INFO,
  PROVIDERS,
  type ProviderId,
} from './providers';

function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.querySelector(`#${id}`);
  if (!(element instanceof type)) {
    throw new TypeError(`Missing #${id}`);
  }
  return element;
}

const form = requireElement('form', HTMLFormElement);
const input = requireElement('apiKey', HTMLInputElement);
const languageInput = requireElement('language', HTMLInputElement);
const reasonLanguageInput = requireElement('reasonLanguage', HTMLInputElement);
const status = requireElement('status', HTMLParagraphElement);
const providerSelect = requireElement('provider', HTMLSelectElement);
const providerHint = requireElement('providerHint', HTMLParagraphElement);
const keyLabel = requireElement('apiKeyLabel', HTMLLabelElement);
const keyHint = requireElement('keyHint', HTMLSpanElement);
const keyLink = requireElement('keyLink', HTMLAnchorElement);
const fields = [input, languageInput, reasonLanguageInput, providerSelect];
const access = requireElement('access', HTMLElement);
const accessText = requireElement('accessText', HTMLParagraphElement);
const grantAccess = requireElement('grantAccess', HTMLButtonElement);

for (const provider of PROVIDERS) {
  const option = document.createElement('option');
  option.value = provider.id;
  option.textContent = provider.company;
  providerSelect.append(option);
}

// The key typed for each provider. The key field shows the selected provider's entry and writes
// back to it on every keystroke, so a save always finds each key under its own provider.
const keys: Record<ProviderId, string> = { anthropic: '', openai: '' };
const shown: { provider: ProviderId } = { provider: DEFAULT_PROVIDER };

function selectedProvider(): ProviderId {
  return isProviderId(providerSelect.value) ? providerSelect.value : DEFAULT_PROVIDER;
}

function showProvider(id: ProviderId): void {
  const info = PROVIDER_INFO[id];
  shown.provider = id;
  providerSelect.value = id;
  input.value = keys[id];
  providerHint.textContent = `Selected text is sent to ${info.company} for correction.`;
  keyLabel.textContent = `${info.company} API key`;
  keyHint.textContent = `The key is stored locally in this browser profile and sent only to ${info.host}.`;
  keyLink.textContent = `Get an ${info.company} API key`;
  keyLink.href = info.keyUrl;
  accessText.textContent = `Voran needs access to ${info.host} to correct text.`;
  grantAccess.textContent = `Grant access to ${info.host}`;
  void showAccess();
}

// The user can withhold API access (Chrome site access setting, Firefox about:addons), also while
// this page is open. Only the selected provider's API matters.
async function showAccess(): Promise<void> {
  access.hidden = await hasApiAccess(chrome.permissions, shown.provider);
}

async function grant(): Promise<void> {
  status.textContent = '';
  if (!(await requestApiAccess(chrome.permissions, shown.provider))) {
    status.textContent = 'Access not granted.';
  }
  await showAccess();
}

const labels = LANGUAGES.map((language) => languageLabel(language));
attachCombobox(languageInput, [AUTO_LABEL, ...labels]);
attachCombobox(reasonLanguageInput, [SAME_LABEL, ...labels]);

function labelFor(id: string, special: string, specialLabel: string): string {
  if (id === special) {
    return specialLabel;
  }
  const language = LANGUAGES.find((candidate) => candidate.id === id);
  return language === undefined ? specialLabel : languageLabel(language);
}

function showSettings(language: string, reasonLanguage: string): void {
  languageInput.value = labelFor(language, AUTO_LANGUAGE, AUTO_LABEL);
  reasonLanguageInput.value = labelFor(reasonLanguage, SAME_LANGUAGE, SAME_LABEL);
}

showSettings(DEFAULT_SETTINGS.language, DEFAULT_SETTINGS.reasonLanguage);
showProvider(DEFAULT_SETTINGS.provider);

async function load(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get([
      ...Object.values(STORAGE_KEYS_API_KEY),
      STORAGE_KEY_LANGUAGE,
      STORAGE_KEY_REASON_LANGUAGE,
      STORAGE_KEY_PROVIDER,
    ]);
    for (const { id } of PROVIDERS) {
      const apiKey = stored[STORAGE_KEYS_API_KEY[id]];
      keys[id] = typeof apiKey === 'string' ? apiKey : '';
    }
    const settings = normalizeSettings(stored);
    showSettings(settings.language, settings.reasonLanguage);
    showProvider(settings.provider);
    for (const field of fields) {
      field.disabled = false;
    }
  } catch {
    status.textContent = 'Could not load the saved settings. Reload this page.';
  }
}

// Saving before the stored values are loaded would overwrite them with the defaults.
for (const field of fields) {
  field.disabled = true;
}
void load();

/**
Resolves typed text to a stored value: the special value for its label or an empty input, else a
language id. Undefined when the text names no known language.
*/
function resolve(text: string, special: string, specialLabel: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === '' || trimmed.toLowerCase() === specialLabel.toLowerCase()
    ? special
    : languageFromLabel(trimmed)?.id;
}

/**
Writes the whole page state: provider and every provider's key always, the languages only when both
name a known language. Each save reads the current state, so the order of queued saves does not
matter.
*/
async function save(): Promise<void> {
  status.textContent = '';
  const language = resolve(languageInput.value, AUTO_LANGUAGE, AUTO_LABEL);
  const reasonLanguage = resolve(reasonLanguageInput.value, SAME_LANGUAGE, SAME_LABEL);
  const languagesValid = language !== undefined && reasonLanguage !== undefined;
  const provider = selectedProvider();
  const trimmed = PROVIDERS.map(({ id }) => [STORAGE_KEYS_API_KEY[id], keys[id].trim()] as const);
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY_PROVIDER]: provider,
      ...Object.fromEntries(trimmed.filter(([, key]) => key !== '')),
      ...(languagesValid && {
        [STORAGE_KEY_LANGUAGE]: language,
        [STORAGE_KEY_REASON_LANGUAGE]: reasonLanguage,
      }),
    });
    const cleared = trimmed.filter(([, key]) => key === '').map(([name]) => name);
    if (cleared.length > 0) {
      await chrome.storage.local.remove(cleared);
    }
    if (!languagesValid) {
      status.textContent = 'Pick a language from the list.';
      return;
    }
    showSettings(language, reasonLanguage);
    status.textContent =
      keys[provider].trim() === ''
        ? `Saved. No ${PROVIDER_INFO[provider].company} API key set.`
        : 'Saved.';
  } catch {
    status.textContent = 'Could not save the settings.';
  }
}

// Saves run one after another so quick consecutive changes cannot interleave their writes.
const queue = { tail: Promise.resolve() };

async function saveAfter(previous: Promise<void>): Promise<void> {
  await previous;
  await save();
}

function queueSave(): void {
  queue.tail = saveAfter(queue.tail);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
});
input.addEventListener('input', () => {
  keys[shown.provider] = input.value;
});
// Show the newly selected provider's own key; the previous one stays stored under its provider.
providerSelect.addEventListener('change', () => {
  showProvider(selectedProvider());
});
for (const field of fields) {
  field.addEventListener('change', queueSave);
}

grantAccess.addEventListener('click', () => {
  void grant();
});
chrome.permissions.onAdded.addListener(() => {
  void showAccess();
});
chrome.permissions.onRemoved.addListener(() => {
  void showAccess();
});
