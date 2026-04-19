/** In-process TTL cache (dev + single-node server). For serverless, treat as best-effort. */

type Entry = { expiresAt: number; value: unknown };
const store = new Map<string, Entry>();

export async function cachedJson<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await fetcher();
  store.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

export function cacheStats() {
  return { size: store.size };
}
