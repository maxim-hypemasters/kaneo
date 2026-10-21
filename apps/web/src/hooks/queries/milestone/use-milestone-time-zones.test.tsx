import { cleanup, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useGetMilestones } from "./use-get-milestones";
import { useGetProjectMilestones } from "./use-get-project-milestones";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  feature: vi.fn(),
  project: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mocks.query(options),
}));
vi.mock("@/fetchers/milestone/milestones", () => ({
  getMilestones: (...args: unknown[]) => mocks.feature(...args),
  getProjectMilestones: (...args: unknown[]) => mocks.project(...args),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("milestone date timezone caches", () => {
  it("keeps Feature dates separate for viewers while retaining the project invalidation prefix", () => {
    renderHook(() => useGetMilestones("p", "f", "America/New_York"));
    renderHook(() => useGetMilestones("p", "f", "Asia/Tokyo"));
    const [first, second] = mocks.query.mock.calls.map(([options]) => options);
    expect(first.queryKey).toEqual([
      "feature-milestones",
      "p",
      "f",
      "America/New_York",
    ]);
    expect(second.queryKey).toEqual([
      "feature-milestones",
      "p",
      "f",
      "Asia/Tokyo",
    ]);
    first.queryFn();
    second.queryFn();
    expect(mocks.feature.mock.calls).toEqual([
      ["f", "America/New_York"],
      ["f", "Asia/Tokyo"],
    ]);
  });
  it("uses the same viewer timezone for the project summary cache and request", () => {
    renderHook(() => useGetProjectMilestones("p", "Europe/Belgrade"));
    const options = mocks.query.mock.calls[0][0];
    expect(options.queryKey).toEqual([
      "feature-milestones",
      "p",
      "project",
      "Europe/Belgrade",
    ]);
    options.queryFn();
    expect(mocks.project).toHaveBeenCalledExactlyOnceWith(
      "p",
      "Europe/Belgrade",
    );
  });
});
