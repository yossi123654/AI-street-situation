import type { Camera } from "@/lib/types";

/**
 * Wraps a "fetch every camera" function in a time-based cache. Failed
 * fetches are not kept, so the next request retries.
 */
export function cachedList(
  ttlMs: number,
  fetchAll: () => Promise<Camera[]>,
): () => Promise<Camera[]> {
  let cache: { at: number; cameras: Promise<Camera[]> } | undefined;
  return () => {
    if (!cache || Date.now() - cache.at > ttlMs) {
      const cameras = fetchAll();
      cache = { at: Date.now(), cameras };
      cameras.catch(() => {
        if (cache?.cameras === cameras) cache = undefined;
      });
    }
    return cache.cameras;
  };
}

/** Today's date as YYYY-MM-DD (UTC), for feeds verified at fetch time. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
