import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useFeatureLinkCandidates } from "./use-feature-link-candidates";

const mocks = vi.hoisted(() => ({ query: vi.fn(), get: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mocks.query(options),
}));
vi.mock("@/fetchers/task/get-feature-link-candidates", () => ({
  default: (...args: unknown[]) => mocks.get(...args),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("keys candidates by actual project, search and page", () => {
  renderHook(() => useFeatureLinkCandidates("p", "  Baseline ", 3, true));
  const options = mocks.query.mock.calls[0][0];
  expect(options).toMatchObject({
    queryKey: ["feature-create-candidates", "p", "Baseline", 3],
    enabled: true,
  });
  const signal = new AbortController().signal;
  options.queryFn({ signal });
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith("p", "Baseline", 3, signal);
});

it.each([
  ["p", false],
  ["", true],
])(
  "does not load outside an open permitted project picker",
  (projectId, enabled) => {
    renderHook(() => useFeatureLinkCandidates(projectId, "", 1, enabled));
    expect(mocks.query.mock.calls[0][0].enabled).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
  },
);
