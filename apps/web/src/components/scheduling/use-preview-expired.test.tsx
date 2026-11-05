import { act, cleanup, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { usePreviewExpired } from "./use-preview-expired";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T09:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("preview expiry", () => {
  it("marks a preview stale at its server deadline and resets for a new preview", () => {
    const { result, rerender } = renderHook(
      ({ expiry }) => usePreviewExpired(expiry),
      {
        initialProps: { expiry: "2026-09-01T09:15:00Z" as string | undefined },
      },
    );
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(15 * 60_000 + 1));
    expect(result.current).toBe(true);
    rerender({ expiry: "2026-09-01T09:30:00Z" });
    expect(result.current).toBe(false);
  });
  it("rechecks after a suspended tab resumes and tolerates older responses", () => {
    const { result, rerender } = renderHook(
      ({ expiry }: { expiry?: string }) => usePreviewExpired(expiry),
      {
        initialProps: { expiry: "2026-09-01T09:15:00Z" as string | undefined },
      },
    );
    act(() => {
      vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(result.current).toBe(true);
    rerender({ expiry: undefined });
    expect(result.current).toBe(false);
    rerender({ expiry: "invalid" });
    expect(result.current).toBe(true);
  });
});
