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
  releaseProgressKey,
  useGetReleaseProgress,
} from "./use-get-release-progress";

const m = vi.hoisted(() => ({
  day: 1,
  query: vi.fn(),
  refetch: vi.fn(),
  getProgress: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => {
    m.query(options);
    return { refetch: m.refetch };
  },
}));
vi.mock("@/hooks/use-local-day", () => ({ useLocalDay: () => m.day }));
vi.mock("@/fetchers/release/get-release-progress", () => ({
  default: (...args: unknown[]) => m.getProgress(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.day = 1;
});
afterEach(cleanup);

describe("useGetReleaseProgress", () => {
  it("keeps the selected release and time zone in the key, under a project prefix", () => {
    renderHook(() =>
      useGetReleaseProgress("project-1", "release-1", "Europe/Belgrade"),
    );
    expect(releaseProgressKey("project-1")).toEqual([
      "release-progress",
      "project-1",
    ]);
    const options = m.query.mock.calls[0][0];
    expect(options.queryKey).toEqual([
      "release-progress",
      "project-1",
      "release-1",
      "Europe/Belgrade",
    ]);
    options.queryFn();
    expect(m.getProgress).toHaveBeenCalledWith("release-1", "Europe/Belgrade");
  });

  it("refreshes at the viewer's midnight without another mount request", () => {
    const { rerender } = renderHook(() =>
      useGetReleaseProgress("project-1", "release-1", "UTC"),
    );
    expect(m.refetch).not.toHaveBeenCalled();
    m.day = 2;
    rerender();
    expect(m.refetch).toHaveBeenCalledOnce();
    rerender();
    expect(m.refetch).toHaveBeenCalledOnce();
  });
});
