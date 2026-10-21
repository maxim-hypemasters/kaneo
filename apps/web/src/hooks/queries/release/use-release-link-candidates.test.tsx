import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useReleaseLinkCandidates } from "./use-release-link-candidates";

const m = vi.hoisted(() => ({ query: vi.fn(), get: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => m.query(options),
}));
vi.mock("@/fetchers/release/get-release-link-candidates", () => ({
  default: (...args: unknown[]) => m.get(...args),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("keys each project, release, kind, search and page independently", () => {
  renderHook(() =>
    useReleaseLinkCandidates("p", "r", "milestone", "  Core ", 3, true),
  );
  const options = m.query.mock.calls[0][0];
  expect(options).toMatchObject({
    queryKey: ["release-link-candidates", "p", "r", "milestone", "Core", 3],
    enabled: true,
  });
  const signal = new AbortController().signal;
  options.queryFn({ signal });
  expect(m.get).toHaveBeenCalledExactlyOnceWith(
    "r",
    "milestone",
    "Core",
    3,
    signal,
  );
});

it.each([
  ["p", "r", false],
  ["", "r", true],
  ["p", "", true],
])(
  "does not fetch without an open permitted picker and valid scope",
  (project, release, open) => {
    renderHook(() =>
      useReleaseLinkCandidates(project, release, "task", "", 1, open),
    );
    expect(m.query.mock.calls[0][0].enabled).toBe(false);
    expect(m.get).not.toHaveBeenCalled();
  },
);
