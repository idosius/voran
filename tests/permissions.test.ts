import { describe, expect, it, vi } from 'vitest';
import { API_ORIGIN } from '../src/constants';
import {
  NoAccessError,
  type PermissionsApi,
  hasApiAccess,
  requestApiAccess,
  requireApiAccess,
} from '../src/permissions';

function fakePermissions(granted: boolean): {
  api: PermissionsApi;
  contains: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
} {
  const contains = vi.fn(() => Promise.resolve(granted));
  const request = vi.fn(() => Promise.resolve(granted));
  return { api: { contains, request }, contains, request };
}

function failingPermissions(): PermissionsApi {
  return {
    contains: () => Promise.reject(new Error('unsupported')),
    request: () => Promise.reject(new Error('not a user gesture')),
  };
}

describe('hasApiAccess', () => {
  it('checks the API origin', async () => {
    const { api, contains } = fakePermissions(true);
    await expect(hasApiAccess(api)).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith({ origins: [API_ORIGIN] });
  });

  it('reports missing access', async () => {
    await expect(hasApiAccess(fakePermissions(false).api)).resolves.toBe(false);
  });

  it('treats an error as missing access', async () => {
    await expect(hasApiAccess(failingPermissions())).resolves.toBe(false);
  });
});

describe('requireApiAccess', () => {
  it('resolves when access is granted', async () => {
    await expect(requireApiAccess(fakePermissions(true).api)).resolves.toBeUndefined();
  });

  it('throws NoAccessError with a message pointing to the options page', async () => {
    const result = requireApiAccess(fakePermissions(false).api);
    await expect(result).rejects.toBeInstanceOf(NoAccessError);
    await expect(result).rejects.toThrow(/options page/);
  });
});

describe('requestApiAccess', () => {
  it('requests the API origin', async () => {
    const { api, request } = fakePermissions(true);
    await expect(requestApiAccess(api)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: [API_ORIGIN] });
  });

  it('reports a refusal', async () => {
    await expect(requestApiAccess(fakePermissions(false).api)).resolves.toBe(false);
  });

  it('treats an error as a refusal', async () => {
    await expect(requestApiAccess(failingPermissions())).resolves.toBe(false);
  });
});
