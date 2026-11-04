import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useCurrentMinute } from "./use-current-minute";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("shares one clock for visible finish indicators and releases it after the last subscriber", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T15:59:30Z"));
  const first = renderHook(() => useCurrentMinute());
  const second = renderHook(() => useCurrentMinute());
  expect(first.result.current).toBe(Date.now());
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(60_000));
  expect(first.result.current).toBe(new Date("2026-10-24T16:00:30Z").getTime());
  expect(second.result.current).toBe(first.result.current);
  first.unmount();
  expect(vi.getTimerCount()).toBe(1);
  second.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
