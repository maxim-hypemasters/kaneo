import { LOOPBACK_CONCURRENCY } from "../constants";

export type Limiter = { run<T>(fn: () => Promise<T>): Promise<T> };

/** A FIFO semaphore: at most `max` calls of `run` are in flight at once. */
export function createLimiter(max: number): Limiter {
  let active = 0;
  const waiting: (() => void)[] = [];

  const acquire = (): Promise<void> => {
    if (active < max) {
      active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };
  // A waiter inherits the released slot, so `active` stays the same.
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  return {
    async run(fn) {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

/**
 * Shared by every assistant loopback request in this process, so tool calls
 * cannot exhaust the database pool the API itself needs.
 */
export const loopbackLimiter = createLimiter(LOOPBACK_CONCURRENCY);
