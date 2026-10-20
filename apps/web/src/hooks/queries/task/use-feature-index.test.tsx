import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { useFeatureIndex } from "./use-feature-index";

vi.mock("@/fetchers/task/get-project-features", () => ({
  default: vi.fn().mockResolvedValue([
    {
      id: "feature",
      title: "Knowledge record",
      number: 1,
      status: null,
      releaseId: null,
      archivedAt: null,
    },
  ]),
}));
const board = (title: string) => ({
  columns: [
    {
      tasks: [
        { id: "feature", title, type: "feature", featureId: null },
        { id: "task", title: "Task", type: "task", featureId: "feature" },
      ],
    },
  ],
  plannedTasks: [],
  archivedTasks: [],
});

describe("useFeatureIndex", () => {
  it("uses shared Feature summaries without observing or refetching the board", async () => {
    const queryClient = new QueryClient();
    const fetchBoard = async () => board("Fetched");
    queryClient.setQueryDefaults(["tasks", "project"], {
      queryFn: fetchBoard,
    });
    queryClient.setQueryData(["tasks", "project"], board("Checkout"));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useFeatureIndex("project"), {
      wrapper,
    });

    expect(result.current.features.get("feature")?.title).toBe("Checkout");
    expect(result.current.tasksByFeature.get("feature")).toHaveLength(1);
    // A reader observer would replace the board query's fetcher.
    const query = queryClient.getQueryCache().find({
      queryKey: ["tasks", "project"],
    });
    expect(query?.getObserversCount()).toBe(0);

    act(() => {
      queryClient.setQueryData(["tasks", "project"], board("Renamed"));
    });
    await waitFor(() =>
      expect(result.current.features.get("feature")?.title).toBe(
        "Knowledge record",
      ),
    );
    expect(result.current.features.get("feature")?.status).toBeNull();
    act(() => {
      queryClient.setQueryData(
        ["project-features", "project"],
        [
          {
            id: "feature",
            title: "Renamed knowledge",
            number: 1,
            status: null,
            releaseId: null,
            archivedAt: null,
          },
        ],
      );
    });
    await waitFor(() =>
      expect(result.current.features.get("feature")?.title).toBe(
        "Renamed knowledge",
      ),
    );
  });
});
