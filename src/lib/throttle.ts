/**
 * Serialises calls so that consecutive calls start at least `minIntervalMs`
 * apart. Used to respect upstream usage policies (e.g. Nominatim's absolute
 * maximum of one request per second).
 */
export function createThrottle(minIntervalMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  return function throttle<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = lastStart + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      return task();
    };
    const result = chain.then(run, run);
    chain = result.catch(() => undefined);
    return result;
  };
}
