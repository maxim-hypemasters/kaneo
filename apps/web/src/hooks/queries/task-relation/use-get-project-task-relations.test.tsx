import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import useGetProjectTaskRelations from "./use-get-project-task-relations";

const getProjectTaskRelations = vi.hoisted(() => vi.fn());
vi.mock("@/fetchers/task-relation/get-project-task-relations", () => ({
  default: getProjectTaskRelations,
}));

// Mirrors the app client, which turns refetchOnMount off by default.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnMount: false } },
});

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  getProjectTaskRelations.mockReset();
});

describe("useGetProjectTaskRelations", () => {
  it("caches each relation type under the project's key", async () => {
    getProjectTaskRelations.mockResolvedValue([]);
    const { result } = renderHook(
      () =>
        useGetProjectTaskRelations({ projectId: "p", relationType: "blocks" }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getProjectTaskRelations).toHaveBeenCalledWith("p", "blocks");
    expect(
      queryClient.getQueryData(["project-task-relations", "p", "blocks"]),
    ).toEqual([]);

    renderHook(() => useGetProjectTaskRelations({ projectId: "p" }), {
      wrapper: Wrapper,
    });
    await waitFor(() =>
      expect(getProjectTaskRelations).toHaveBeenCalledWith("p", undefined),
    );
    expect(
      queryClient.getQueryState(["project-task-relations", "p", "all"]),
    ).toBeDefined();
  });

  it("refetches relations invalidated while the Gantt was closed", async () => {
    getProjectTaskRelations.mockResolvedValue([]);
    const first = renderHook(
      () =>
        useGetProjectTaskRelations({ projectId: "p", relationType: "blocks" }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    await queryClient.invalidateQueries({
      queryKey: ["project-task-relations", "p"],
    });
    expect(getProjectTaskRelations).toHaveBeenCalledTimes(1);

    renderHook(
      () =>
        useGetProjectTaskRelations({ projectId: "p", relationType: "blocks" }),
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(getProjectTaskRelations).toHaveBeenCalledTimes(2),
    );
  });

  it("does not fetch while disabled or without a project", () => {
    renderHook(
      () => useGetProjectTaskRelations({ projectId: "p", enabled: false }),
      { wrapper: Wrapper },
    );
    renderHook(() => useGetProjectTaskRelations({ projectId: "" }), {
      wrapper: Wrapper,
    });
    expect(getProjectTaskRelations).not.toHaveBeenCalled();
  });
});
