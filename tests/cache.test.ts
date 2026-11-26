import { describe, expect, it, vi } from 'vitest';
import { CACHE_STORAGE_KEY, type CacheStore, createFixCache } from '../src/cache';
import { DEFAULT_SETTINGS, type Settings } from '../src/languages';
import type { FixResult } from '../src/messages';

function memoryStore(): CacheStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: (key) => Promise.resolve(Object.hasOwn(data, key) ? { [key]: data[key] } : {}),
    set: (items): Promise<void> => {
      Object.assign(data, items);
      return Promise.resolve();
    },
  };
}

const corrected: FixResult = {
  fixed: 'Die Kinder spielen.',
  segments: [
    { text: 'Die Kinder ' },
    { original: 'spielt', fixed: 'spielen', reason: 'verb agreement' },
    { text: '.' },
  ],
  language: 'German',
};

describe('createFixCache', () => {
  it('computes once and serves the same text from the cache', async () => {
    const cache = createFixCache(memoryStore());
    const compute = vi.fn(() => Promise.resolve(corrected));
    expect(await cache.run('Die Kinder spielt.', DEFAULT_SETTINGS, compute)).toEqual(corrected);
    expect(await cache.run('Die Kinder spielt.', DEFAULT_SETTINGS, compute)).toEqual(corrected);
    expect(compute).toHaveBeenCalledOnce();
  });

  it('treats the applied correction as already correct', async () => {
    const cache = createFixCache(memoryStore());
    await cache.run('Die Kinder spielt.', DEFAULT_SETTINGS, () => Promise.resolve(corrected));
    const compute = vi.fn(() => Promise.resolve(corrected));
    expect(await cache.run('Die Kinder spielen.', DEFAULT_SETTINGS, compute)).toEqual({
      fixed: 'Die Kinder spielen.',
      segments: [],
      language: 'German',
    });
    expect(compute).not.toHaveBeenCalled();
  });

  it('stores an already correct text once, without a language when none was reported', async () => {
    const store = memoryStore();
    const cache = createFixCache(store);
    const correct: FixResult = { fixed: 'Gut.', segments: [] };
    await cache.run('Gut.', DEFAULT_SETTINGS, () => Promise.resolve(correct));
    expect(store.data[CACHE_STORAGE_KEY]).toHaveLength(1);
    const changed: FixResult = { fixed: 'Gut!', segments: [] };
    await cache.run('Gut', DEFAULT_SETTINGS, () => Promise.resolve(changed));
    const compute = vi.fn(() => Promise.resolve(changed));
    expect(await cache.run('Gut!', DEFAULT_SETTINGS, compute)).toEqual(changed);
    expect(compute).not.toHaveBeenCalled();
  });

  it('keys results by settings', async () => {
    const cache = createFixCache(memoryStore());
    const other: Settings = { language: 'German', reasonLanguage: 'German' };
    const compute = vi.fn(() => Promise.resolve(corrected));
    await cache.run('Die Kinder spielt.', DEFAULT_SETTINGS, compute);
    await cache.run('Die Kinder spielt.', other, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('shares one computation between concurrent requests', async () => {
    const cache = createFixCache(memoryStore());
    const compute = vi.fn(() => Promise.resolve(corrected));
    const results = await Promise.all([
      cache.run('Die Kinder spielt.', DEFAULT_SETTINGS, compute),
      cache.run('Die Kinder spielt.', DEFAULT_SETTINGS, compute),
    ]);
    expect(results).toEqual([corrected, corrected]);
    expect(compute).toHaveBeenCalledOnce();
  });

  it('does not cache failures', async () => {
    const cache = createFixCache(memoryStore());
    await expect(
      cache.run('a', DEFAULT_SETTINGS, () => Promise.reject(new Error('offline'))),
    ).rejects.toThrow('offline');
    const compute = vi.fn(() => Promise.resolve({ fixed: 'a', segments: [] }));
    await cache.run('a', DEFAULT_SETTINGS, compute);
    expect(compute).toHaveBeenCalledOnce();
  });

  it('evicts the least recently used entry beyond the limit', async () => {
    const cache = createFixCache(memoryStore(), 2);
    const compute = vi.fn((text: string) => Promise.resolve({ fixed: text, segments: [] }));
    const run = (text: string): Promise<FixResult> =>
      cache.run(text, DEFAULT_SETTINGS, () => compute(text));
    await run('a');
    await run('b');
    await run('a'); // a becomes most recent
    await run('c'); // evicts b
    await run('a');
    expect(compute).toHaveBeenCalledTimes(3);
    await run('b');
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('ignores malformed stored data', async () => {
    const store = memoryStore();
    store.data[CACHE_STORAGE_KEY] = [
      'junk',
      { key: 'k', result: { fixed: 1 } },
      { key: 'k', result: { fixed: 'x', segments: [], language: 3 } },
    ];
    const compute = vi.fn(() => Promise.resolve(corrected));
    await createFixCache(store).run('Die Kinder spielt.', DEFAULT_SETTINGS, compute);
    expect(compute).toHaveBeenCalledOnce();
    store.data[CACHE_STORAGE_KEY] = 'junk';
    await createFixCache(store).run('x', DEFAULT_SETTINGS, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
