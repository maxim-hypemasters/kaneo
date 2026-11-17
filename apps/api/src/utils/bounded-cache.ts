// Returns the cached value for `key`, or makes and stores it. Past `limit`
// entries the oldest is dropped, so keys built from request input (years,
// languages, stored codes) cannot grow memory without bound.
export function cached<T>(
  cache: Map<string, T>,
  limit: number,
  key: string,
  make: () => T,
): T {
  if (cache.has(key)) return cache.get(key) as T;
  const value = make();
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value as string);
  return value;
}
