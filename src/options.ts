import { STORAGE_KEY_API_KEY } from './constants';

function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.querySelector(`#${id}`);
  if (!(element instanceof type)) {
    throw new TypeError(`Missing #${id}`);
  }
  return element;
}

const form = requireElement('form', HTMLFormElement);
const input = requireElement('apiKey', HTMLInputElement);
const status = requireElement('status', HTMLSpanElement);

void chrome.storage.local.get(STORAGE_KEY_API_KEY).then((stored) => {
  const apiKey = stored[STORAGE_KEY_API_KEY];
  if (typeof apiKey === 'string') {
    input.value = apiKey;
  }
});

async function save(apiKey: string): Promise<void> {
  status.textContent = '';
  try {
    await (apiKey === ''
      ? chrome.storage.local.remove(STORAGE_KEY_API_KEY)
      : chrome.storage.local.set({ [STORAGE_KEY_API_KEY]: apiKey }));
    status.textContent = apiKey === '' ? 'Key removed.' : 'Saved.';
  } catch {
    status.textContent = 'Could not save the key.';
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void save(input.value.trim());
});
