import { MODELS } from './constants';
import type { Settings } from './languages';
import { type FixResult, isRecord, isSegmentList } from './messages';

/**
The subset of `chrome.storage.StorageArea` the cache needs, so tests can pass an in-memory store.
*/
export interface CacheStore {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const CACHE_STORAGE_KEY = 'fixCache';
const DEFAULT_LIMIT = 50;

interface Entry {
  readonly key: string;
  readonly result: FixResult;
}

function isFixResult(value: unknown): value is FixResult {
  return (
    isRecord(value) &&
    typeof value['fixed'] === 'string' &&
    isSegmentList(value['segments']) &&
    (value['language'] === undefined || typeof value['language'] === 'string')
  );
}

function isEntry(value: unknown): value is Entry {
  return isRecord(value) && typeof value['key'] === 'string' && isFixResult(value['result']);
}

async function cacheKey(text: string, settings: Settings): Promise<string> {
  // The model and settings are part of the key: a change to either must not serve an old answer.
  const source = JSON.stringify([
    MODELS[settings.provider],
    settings.language,
    settings.reasonLanguage,
    text,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface FixCache {
  /**
  The cached result for `text` under `settings`, else the result of `compute`, which is then cached.
  Concurrent calls for the same text share one `compute`. Failures are not cached.
  */
  run(text: string, settings: Settings, compute: () => Promise<FixResult>): Promise<FixResult>;
}

/**
Results kept most recent first, at most `limit` of them. After a correction the fixed text is also
stored as already correct, so checking it again right after applying costs no request.
*/
export function createFixCache(store: CacheStore, limit = DEFAULT_LIMIT): FixCache {
  const pending = new Map<string, Promise<FixResult>>();

  async function load(): Promise<Entry[]> {
    const items = await store.get(CACHE_STORAGE_KEY);
    const stored = items[CACHE_STORAGE_KEY];
    return Array.isArray(stored) ? (stored as unknown[]).filter((item) => isEntry(item)) : [];
  }

  async function save(added: readonly Entry[]): Promise<void> {
    const keys = new Set(added.map((entry) => entry.key));
    const entries = await load();
    const kept = entries.filter((entry) => !keys.has(entry.key));
    await store.set({ [CACHE_STORAGE_KEY]: [...added, ...kept].slice(0, limit) });
  }

  async function lookup(
    key: string,
    text: string,
    settings: Settings,
    compute: () => Promise<FixResult>,
  ): Promise<FixResult> {
    const entries = await load();
    const hit = entries.find((entry) => entry.key === key);
    if (hit !== undefined) {
      await save([hit]);
      return hit.result;
    }
    const result = await compute();
    const added: Entry[] = [{ key, result }];
    if (result.fixed !== text) {
      const correct: FixResult =
        result.language === undefined
          ? { fixed: result.fixed, segments: [] }
          : { fixed: result.fixed, segments: [], language: result.language };
      added.push({ key: await cacheKey(result.fixed, settings), result: correct });
    }
    await save(added);
    return result;
  }

  return {
    async run(text, settings, compute): Promise<FixResult> {
      const key = await cacheKey(text, settings);
      const running = pending.get(key);
      if (running !== undefined) {
        return running;
      }
      const promise = lookup(key, text, settings, compute);
      pending.set(key, promise);
      try {
        return await promise;
      } finally {
        pending.delete(key);
      }
    },
  };
}
