import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useIsUpcoming } from "./use-is-upcoming";

const NOW = Date.parse("2026-11-26T10:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useIsUpcoming", () => {
  it("stays true until the time passes", () => {
    const { result } = renderHook(() =>
      useIsUpcoming(new Date(NOW + 30_000).toISOString()),
    );
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(false);
  });

  it("follows a time pushed back by later edits", () => {
    const view = renderHook(({ at }) => useIsUpcoming(at), {
      initialProps: { at: new Date(NOW + 10_000).toISOString() },
    });
    view.rerender({ at: new Date(NOW + 40_000).toISOString() });

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(view.result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(view.result.current).toBe(false);
  });

  it("is false without a time or once it has passed", () => {
    expect(renderHook(() => useIsUpcoming(null)).result.current).toBe(false);
    expect(
      renderHook(() => useIsUpcoming(new Date(NOW - 1_000).toISOString()))
        .result.current,
    ).toBe(false);
  });
});
