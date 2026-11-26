const locks = new Map<string, Promise<unknown>>();

/** Serializes work on one mirror, since git refuses concurrent fetches. */
export function withRepoLock<T>(key: string, work: () => Promise<T>) {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  locks.set(key, next);
  const release = () => {
    if (locks.get(key) === next) locks.delete(key);
  };
  next.then(release, release);
  return next;
}
