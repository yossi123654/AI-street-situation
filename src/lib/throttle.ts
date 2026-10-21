/** Thrown when a throttle's queue is full: the caller should fail fast instead of waiting. */
export class ThrottleBusyError extends Error {
  constructor() {
    super("too many queued requests to this upstream service");
    this.name = "ThrottleBusyError";
  }
}

/**
 * Serialises calls so that consecutive calls start at least `minIntervalMs`
 * apart. Used to respect upstream usage policies (e.g. Nominatim's absolute
 * maximum of one request per second). At most `maxQueue` calls may wait;
 * further calls are rejected at once, so a flood of requests cannot build an
 * ever-growing queue (and minutes-long waits) in memory.
 */
export function createThrottle(minIntervalMs: number, maxQueue = 30) {
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = 0;
  let pending = 0;

  return function throttle<T>(task: () => Promise<T>): Promise<T> {
    if (pending >= maxQueue) return Promise.reject(new ThrottleBusyError());
    pending++;
    const run = async () => {
      const wait = lastStart + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      try {
        return await task();
      } finally {
        pending--;
      }
    };
    const result = chain.then(run, run);
    chain = result.catch(() => undefined);
    return result;
  };
}
