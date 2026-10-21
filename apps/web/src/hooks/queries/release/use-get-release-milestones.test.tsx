import { cleanup, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import {
  releaseMilestonesKey,
  useGetReleaseMilestones,
} from "./use-get-release-milestones";

const mocks = vi.hoisted(() => ({ query: vi.fn(), get: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mocks.query(options),
}));
vi.mock("@/fetchers/release/get-release-milestones", () => ({
  default: (...args: unknown[]) => mocks.get(...args),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("useGetReleaseMilestones", () => {
  it("shares the project milestone prefix while keeping releases distinct", () => {
    renderHook(() => useGetReleaseMilestones("p", "r", "Europe/Belgrade"));
    const options = mocks.query.mock.calls[0][0];
    expect(options).toMatchObject({
      queryKey: ["feature-milestones", "p", "release", "r", "Europe/Belgrade"],
      enabled: true,
      staleTime: 30_000,
      refetchOnMount: true,
    });
    expect(releaseMilestonesKey("p", "other")).not.toEqual(options.queryKey);
    expect(releaseMilestonesKey("other", "r")).not.toEqual(options.queryKey);
    expect(releaseMilestonesKey("p", "r", "UTC")).not.toEqual(options.queryKey);
    options.queryFn();
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith("r", "Europe/Belgrade");
  });

  it.each([
    ["", "r"],
    ["p", ""],
    ["p", null],
    ["p", undefined],
  ])(
    "waits for a valid project/release pair (%s, %s)",
    (projectId, releaseId) => {
      renderHook(() => useGetReleaseMilestones(projectId ?? "", releaseId));
      expect(mocks.query.mock.calls[0][0].enabled).toBe(false);
      expect(mocks.get).not.toHaveBeenCalled();
    },
  );
});
