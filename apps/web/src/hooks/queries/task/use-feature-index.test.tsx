import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";
import { useFeatureIndex } from "./use-feature-index";

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
  it("follows the cached board without observing (or refetching) it", () => {
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
    expect(result.current.features.get("feature")?.title).toBe("Renamed");
  });
});
