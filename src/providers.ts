export type ProviderId = 'anthropic' | 'openai';

export interface ProviderInfo {
  readonly id: ProviderId;
  // Company name, shown in the options page.
  readonly company: string;
  // Name used in error messages, e.g. "Claude is temporarily unavailable."
  readonly product: string;
  readonly host: string;
  // Host permission pattern for the API.
  readonly origin: string;
  readonly keyUrl: string;
  // Matches the keys this provider issues.
  readonly keyPattern: RegExp;
}

export const PROVIDER_INFO: Readonly<Record<ProviderId, ProviderInfo>> = {
  anthropic: {
    id: 'anthropic',
    company: 'Anthropic',
    product: 'Claude',
    host: 'api.anthropic.com',
    origin: 'https://api.anthropic.com/*',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPattern: /^sk-ant-/,
  },
  openai: {
    id: 'openai',
    company: 'OpenAI',
    product: 'OpenAI',
    host: 'api.openai.com',
    origin: 'https://api.openai.com/*',
    keyUrl: 'https://platform.openai.com/api-keys',
    // sk-proj-, sk-svcacct-, legacy sk-...; everything starting with sk- except Anthropic's.
    keyPattern: /^sk-(?!ant-)/,
  },
};

export const PROVIDERS: readonly ProviderInfo[] = Object.values(PROVIDER_INFO);

export const DEFAULT_PROVIDER: ProviderId = 'anthropic';

export function isProviderId(value: unknown): value is ProviderId {
  return PROVIDERS.some((provider) => provider.id === value);
}

/**
The other provider an API key evidently belongs to, judged by its prefix, so a key is never sent to
the wrong vendor after switching providers. Undefined when the key may belong to `provider`.
*/
export function keyOwner(provider: ProviderId, apiKey: string): ProviderInfo | undefined {
  return PROVIDERS.find((other) => other.id !== provider && other.keyPattern.test(apiKey));
}
