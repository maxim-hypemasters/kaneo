import { describe, expect, it, vi } from "vite-plus/test";
import { cached } from "./bounded-cache";

describe("cached", () => {
  it("makes a value once per key", () => {
    const cache = new Map<string, number>();
    const make = vi.fn(() => 1);
    expect(cached(cache, 2, "a", make)).toBe(1);
    expect(cached(cache, 2, "a", make)).toBe(1);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("drops the oldest key past the limit", () => {
    const cache = new Map<string, string>();
    for (const key of ["a", "b", "c"]) cached(cache, 2, key, () => key);
    expect([...cache.keys()]).toEqual(["b", "c"]);
  });
});
