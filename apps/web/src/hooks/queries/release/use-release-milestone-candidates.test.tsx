import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useReleaseMilestoneCandidates } from "./use-release-milestone-candidates";

const m = vi.hoisted(() => ({ query: vi.fn(), get: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => m.query(options),
}));
vi.mock("@/fetchers/release/get-release-milestone-candidates", () => ({
  default: (...args: unknown[]) => m.get(...args),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("uses the existing project candidate prefix with creation, search and page scope", () => {
  renderHook(() => useReleaseMilestoneCandidates("p", "  Baseline ", 3, true));
  const options = m.query.mock.calls[0][0];
  expect(options).toMatchObject({
    queryKey: [
      "release-link-candidates",
      "p",
      "create",
      "milestone",
      "Baseline",
      3,
    ],
    enabled: true,
  });
  const signal = new AbortController().signal;
  options.queryFn({ signal });
  expect(m.get).toHaveBeenCalledExactlyOnceWith("p", "Baseline", 3, signal);
});

it.each([
  ["p", false],
  ["", true],
])(
  "does not read before an eligible picker is activated",
  (project, enabled) => {
    renderHook(() =>
      useReleaseMilestoneCandidates(
        project as string,
        "",
        1,
        enabled as boolean,
      ),
    );
    expect(m.query.mock.calls[0][0].enabled).toBe(false);
    expect(m.get).not.toHaveBeenCalled();
  },
);
