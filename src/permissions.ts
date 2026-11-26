import { PROVIDER_INFO, type ProviderId } from './providers';

/**
The subset of `chrome.permissions` needed to check and request API access, so tests can pass a fake.
*/
export interface PermissionsApi {
  contains(permissions: { origins: string[] }): Promise<boolean>;
  request(permissions: { origins: string[] }): Promise<boolean>;
}

/**
Thrown by `requireApiAccess` when the extension may not reach the provider's API.
*/
export class NoAccessError extends Error {
  override readonly name = 'NoAccessError';
  constructor(provider: ProviderId) {
    super(`Voran has no access to ${PROVIDER_INFO[provider].host}. Grant it on the options page.`);
  }
}

function origins(provider: ProviderId): { origins: string[] } {
  return { origins: [PROVIDER_INFO[provider].origin] };
}

/**
Users can withhold host access (Chrome: the extension's site access setting; Firefox:
about:addons), so access to the API must be checked before each request.
*/
export async function hasApiAccess(
  permissions: PermissionsApi,
  provider: ProviderId,
): Promise<boolean> {
  try {
    return await permissions.contains(origins(provider));
  } catch {
    return false;
  }
}

export async function requireApiAccess(
  permissions: PermissionsApi,
  provider: ProviderId,
): Promise<void> {
  if (!(await hasApiAccess(permissions, provider))) {
    throw new NoAccessError(provider);
  }
}

/**
Asks the user to grant API access. Must run in a user gesture (e.g. a click handler).
*/
export async function requestApiAccess(
  permissions: PermissionsApi,
  provider: ProviderId,
): Promise<boolean> {
  try {
    return await permissions.request(origins(provider));
  } catch {
    return false;
  }
}
