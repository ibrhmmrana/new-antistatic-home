/**
 * Concurrency limiter (no new deps).
 * Limits how many tasks run at once; queues the rest.
 */
export function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function runNext(): void {
    if (active >= concurrency || queue.length === 0) return;
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  }

  function release(): void {
    active--;
    runNext();
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        fn()
          .then((v) => {
            release();
            resolve(v);
          })
          .catch((e) => {
            release();
            reject(e);
          });
      };
      if (active < concurrency) {
        active++;
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

/** Default limiter: max 4 concurrent tasks. */
export const limit4 = pLimit(4);
