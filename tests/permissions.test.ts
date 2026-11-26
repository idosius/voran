import { describe, expect, it, vi } from 'vitest';
import {
  NoAccessError,
  type PermissionsApi,
  hasApiAccess,
  requestApiAccess,
  requireApiAccess,
} from '../src/permissions';

const ANTHROPIC_ORIGIN = 'https://api.anthropic.com/*';

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
    await expect(hasApiAccess(api, 'anthropic')).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith({ origins: [ANTHROPIC_ORIGIN] });
  });

  it('reports missing access', async () => {
    await expect(hasApiAccess(fakePermissions(false).api, 'anthropic')).resolves.toBe(false);
  });

  it('treats an error as missing access', async () => {
    await expect(hasApiAccess(failingPermissions(), 'anthropic')).resolves.toBe(false);
  });
});

describe('requireApiAccess', () => {
  it('resolves when access is granted', async () => {
    await expect(requireApiAccess(fakePermissions(true).api, 'anthropic')).resolves.toBeUndefined();
  });

  it('throws NoAccessError with a message pointing to the options page', async () => {
    const result = requireApiAccess(fakePermissions(false).api, 'anthropic');
    await expect(result).rejects.toBeInstanceOf(NoAccessError);
    await expect(result).rejects.toThrow(/options page/);
  });
});

describe('requestApiAccess', () => {
  it('requests the API origin', async () => {
    const { api, request } = fakePermissions(true);
    await expect(requestApiAccess(api, 'anthropic')).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: [ANTHROPIC_ORIGIN] });
  });

  it('reports a refusal', async () => {
    await expect(requestApiAccess(fakePermissions(false).api, 'anthropic')).resolves.toBe(false);
  });

  it('treats an error as a refusal', async () => {
    await expect(requestApiAccess(failingPermissions(), 'anthropic')).resolves.toBe(false);
  });
});

describe('OpenAI access', () => {
  it('checks and requests the OpenAI origin', async () => {
    const { api, contains, request } = fakePermissions(true);
    await hasApiAccess(api, 'openai');
    await requestApiAccess(api, 'openai');
    expect(contains).toHaveBeenCalledWith({ origins: ['https://api.openai.com/*'] });
    expect(request).toHaveBeenCalledWith({ origins: ['https://api.openai.com/*'] });
  });

  it('names the OpenAI host when access is missing', async () => {
    await expect(requireApiAccess(fakePermissions(false).api, 'openai')).rejects.toThrow(
      'Voran has no access to api.openai.com. Grant it on the options page.',
    );
  });
});
