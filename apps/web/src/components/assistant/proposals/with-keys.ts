/**
 * Gives each text in a list a React key that stays unique when texts repeat
 * (two tasks with the same title): the text with how often it came before.
 */
export function withKeys<T>(
  items: readonly T[],
  text: (item: T) => string,
): { key: string; item: T }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const value = text(item);
    const count = seen.get(value) ?? 0;
    seen.set(value, count + 1);
    return { key: `${count}:${value}`, item };
  });
}
