import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useProjectSidebarScope } from "./use-project-sidebar-scope";

const mocks = vi.hoisted(() => ({ pathname: "", getTask: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string }) => unknown;
  }) => select({ pathname: mocks.pathname }),
}));
vi.mock("@/fetchers/task/get-task", () => ({ default: mocks.getTask }));
let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.pathname = "/dashboard/workspace/w/project/p/task/f";
  mocks.getTask.mockReset();
});
afterEach(() => {
  cleanup();
  client.clear();
});

it("observes TaskLayout's detail cache without starting another fetch", async () => {
  const { result } = renderHook(() => useProjectSidebarScope("w"), {
    wrapper: Wrapper,
  });
  expect(result.current).toBeNull();
  client.setQueryData(["task", "f"], {
    id: "f",
    projectId: "p",
    type: "feature",
  });
  await waitFor(() =>
    expect(result.current).toEqual({ projectId: "p", scope: "features" }),
  );
  expect(mocks.getTask).not.toHaveBeenCalled();
});

it("ignores a task detail cached for a different project", () => {
  client.setQueryData(["task", "f"], {
    id: "f",
    projectId: "foreign",
    type: "feature",
  });
  const { result } = renderHook(() => useProjectSidebarScope("w"), {
    wrapper: Wrapper,
  });
  expect(result.current).toBeNull();
  expect(mocks.getTask).not.toHaveBeenCalled();
});

it("keeps underlying navigation current while a Feature sheet is open", () => {
  mocks.pathname = "/dashboard/workspace/w/project/p/releases/r";
  client.setQueryData(["task", "f"], {
    id: "f",
    projectId: "p",
    type: "feature",
  });
  const { result } = renderHook(() => useProjectSidebarScope("w"), {
    wrapper: Wrapper,
  });
  expect(result.current).toEqual({ projectId: "p", scope: "releases" });
  expect(mocks.getTask).not.toHaveBeenCalled();
});
