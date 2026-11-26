export const MODELS = { anthropic: 'claude-haiku-5-5', openai: 'gpt-6-luna' } as const;
export const MAX_INPUT_CHARS = 8000;
export const REQUEST_TIMEOUT_MS = 60_000;
export const MENU_ID = 'voran';
// One stored key per provider. The Anthropic key keeps the original name, so existing keys survive.
export const STORAGE_KEYS_API_KEY = { anthropic: 'apiKey', openai: 'apiKeyOpenai' } as const;
export const STORAGE_KEY_LANGUAGE = 'language';
export const STORAGE_KEY_REASON_LANGUAGE = 'reasonLanguage';
export const STORAGE_KEY_PROVIDER = 'provider';
