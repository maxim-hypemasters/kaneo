import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import {
  getProjectSchedule,
  projectScheduleKey,
  type ProjectSchedule,
} from "./project-schedule";
import { useGetProjectSchedule } from "./use-project-schedule";
vi.mock("./project-schedule", async (original) => ({
  ...(await original<typeof import("./project-schedule")>()),
  getProjectSchedule: vi.fn(),
}));
const read: ProjectSchedule = {
  generation: 1,
  appliedAt: "2026-09-01T09:00:00Z",
  revision: "input",
  legacy: false,
  outdated: false,
  settings: { timeZone: "UTC", estimateDayMinutes: 480 },
  tasks: [],
};
let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(getProjectSchedule).mockResolvedValue(read);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});
describe("published project schedule read", () => {
  it("reads only when a project is selected and uses the existing invalidation prefix", async () => {
    const { result, rerender } = renderHook(
      ({ projectId }) => useGetProjectSchedule(projectId),
      { initialProps: { projectId: "" }, wrapper },
    );
    expect(getProjectSchedule).not.toHaveBeenCalled();
    rerender({ projectId: "project" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getProjectSchedule).toHaveBeenCalledWith("project");
    expect(client.getQueryData(projectScheduleKey("project"))).toEqual(read);
  });
  it("keeps published placements while refreshing and reports an outdated release plan", async () => {
    const { result } = renderHook(() => useGetProjectSchedule("project"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    let finish: (value: ProjectSchedule) => void = () => {};
    vi.mocked(getProjectSchedule).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    act(() => {
      void client.invalidateQueries({
        queryKey: projectScheduleKey("project"),
      });
    });
    expect(result.current.data).toEqual(read);
    await act(async () => finish({ ...read, outdated: true }));
    await waitFor(() => expect(result.current.data?.outdated).toBe(true));
  });
});
