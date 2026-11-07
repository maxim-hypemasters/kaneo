import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useFeatureIssues } from "./use-feature-issues";

const mocks = vi.hoisted(() => ({ query: vi.fn(), get: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mocks.query(options),
  keepPreviousData: (value: unknown) => value,
}));
vi.mock("@/fetchers/feature/get-feature-issues", () => ({
  getFeatureIssues: (...args: unknown[]) => mocks.get(...args),
}));
vi.mock("./use-feature-workspace", () => ({
  featureWorkspaceKey: (projectId: string, featureId: string) => [
    "feature-workspace",
    projectId,
    featureId,
  ],
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("isolates complete Issues pages by project, Feature, search, milestone, archive filter and page", () => {
  const filters = {
    search: "Bug",
    page: 3,
    milestoneId: "none",
    archived: "include" as const,
  };
  renderHook(() => useFeatureIssues("project", "feature", filters));
  const options = mocks.query.mock.calls[0]![0];
  expect(options).toMatchObject({
    queryKey: ["feature-workspace", "project", "feature", "issues", filters],
    enabled: true,
  });
  const signal = new AbortController().signal;
  options.queryFn({ signal });
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith("feature", filters, signal);
});

it.each([
  ["", "feature"],
  ["project", ""],
])(
  "does not load without an authorized parent identity",
  (projectId, featureId) => {
    renderHook(() =>
      useFeatureIssues(projectId, featureId, {
        search: "",
        page: 1,
        archived: "exclude",
      }),
    );
    expect(mocks.query.mock.calls[0]![0].enabled).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
  },
);
