import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useReleaseToday } from "./use-release-today";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useReleaseToday", () => {
  it("is the local day as YYYY-MM-DD and moves on at midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 17, 23, 59, 59));
    const { result } = renderHook(useReleaseToday);
    expect(result.current).toBe("2026-10-17");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe("2026-10-18");
  });
});
