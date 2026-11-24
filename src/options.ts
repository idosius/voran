import { attachCombobox } from './combobox';
import {
  STORAGE_KEY_API_KEY,
  STORAGE_KEY_LANGUAGE,
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
const fields = [input, languageInput, reasonLanguageInput];

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

async function load(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get([
      STORAGE_KEY_API_KEY,
      STORAGE_KEY_LANGUAGE,
      STORAGE_KEY_REASON_LANGUAGE,
    ]);
    const apiKey = stored[STORAGE_KEY_API_KEY];
    if (typeof apiKey === 'string') {
      input.value = apiKey;
    }
    const settings = normalizeSettings(stored);
    showSettings(settings.language, settings.reasonLanguage);
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
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY_LANGUAGE]: language,
      [STORAGE_KEY_REASON_LANGUAGE]: reasonLanguage,
      ...(apiKey !== '' && { [STORAGE_KEY_API_KEY]: apiKey }),
    });
    if (apiKey === '') {
      await chrome.storage.local.remove(STORAGE_KEY_API_KEY);
    }
    showSettings(language, reasonLanguage);
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
for (const field of fields) {
  field.addEventListener('change', queueSave);
}
