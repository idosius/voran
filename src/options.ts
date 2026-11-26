import { attachCombobox } from './combobox';
import {
  STORAGE_KEY_API_KEY,
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

for (const provider of PROVIDERS) {
  const option = document.createElement('option');
  option.value = provider.id;
  option.textContent = provider.company;
  providerSelect.append(option);
}

function showProvider(id: ProviderId): void {
  const info = PROVIDER_INFO[id];
  providerSelect.value = id;
  providerHint.textContent = `Selected text is sent to ${info.company} for correction.`;
  keyLabel.textContent = `${info.company} API key`;
  keyHint.textContent = `The key is stored locally in this browser profile and sent only to ${info.host}.`;
  keyLink.textContent = `Get an ${info.company} API key`;
  keyLink.href = info.keyUrl;
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
      STORAGE_KEY_API_KEY,
      STORAGE_KEY_LANGUAGE,
      STORAGE_KEY_REASON_LANGUAGE,
      STORAGE_KEY_PROVIDER,
    ]);
    const apiKey = stored[STORAGE_KEY_API_KEY];
    if (typeof apiKey === 'string') {
      input.value = apiKey;
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

async function save(apiKey: string): Promise<void> {
  status.textContent = '';
  const language = resolve(languageInput.value, AUTO_LANGUAGE, AUTO_LABEL);
  const reasonLanguage = resolve(reasonLanguageInput.value, SAME_LANGUAGE, SAME_LABEL);
  if (language === undefined || reasonLanguage === undefined) {
    status.textContent = 'Pick a language from the list.';
    return;
  }
  const provider = isProviderId(providerSelect.value) ? providerSelect.value : DEFAULT_PROVIDER;
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY_LANGUAGE]: language,
      [STORAGE_KEY_REASON_LANGUAGE]: reasonLanguage,
      [STORAGE_KEY_PROVIDER]: provider,
      ...(apiKey !== '' && { [STORAGE_KEY_API_KEY]: apiKey }),
    });
    if (apiKey === '') {
      await chrome.storage.local.remove(STORAGE_KEY_API_KEY);
    }
    showSettings(language, reasonLanguage);
    showProvider(provider);
    status.textContent = apiKey === '' ? 'Saved. Key removed.' : 'Saved.';
  } catch {
    status.textContent = 'Could not save the settings.';
  }
}

// Saves run one after another so quick consecutive changes cannot interleave their writes.
const queue = { tail: Promise.resolve() };

async function saveAfter(previous: Promise<void>): Promise<void> {
  await previous;
  await save(input.value.trim());
}

function queueSave(): void {
  queue.tail = saveAfter(queue.tail);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
});
// The one stored key belongs to the previous provider; never send it to the new one.
providerSelect.addEventListener('change', () => {
  input.value = '';
});
for (const field of fields) {
  field.addEventListener('change', queueSave);
}
