import { API_ORIGIN } from './constants';

/**
The subset of `chrome.permissions` needed to check and request API access, so tests can pass a fake.
*/
export interface PermissionsApi {
  contains(permissions: { origins: string[] }): Promise<boolean>;
  request(permissions: { origins: string[] }): Promise<boolean>;
}

/**
Thrown by `requireApiAccess` when the extension may not reach the API.
*/
export class NoAccessError extends Error {
  override readonly name = 'NoAccessError';
  constructor() {
    super('Voran has no access to api.anthropic.com. Grant it on the options page.');
  }
}

/**
Users can withhold host access (Chrome: the extension's site access setting; Firefox:
about:addons), so access to the API must be checked before each request.
*/
export async function hasApiAccess(permissions: PermissionsApi): Promise<boolean> {
  try {
    return await permissions.contains({ origins: [API_ORIGIN] });
  } catch {
    return false;
  }
}

export async function requireApiAccess(permissions: PermissionsApi): Promise<void> {
  if (!(await hasApiAccess(permissions))) {
    throw new NoAccessError();
  }
}

/**
Asks the user to grant API access. Must run in a user gesture (e.g. a click handler).
*/
export async function requestApiAccess(permissions: PermissionsApi): Promise<boolean> {
  try {
    return await permissions.request({ origins: [API_ORIGIN] });
  } catch {
    return false;
  }
}
