import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vite-plus/test";
import { invalidateFeatureChange } from "./invalidate-feature-change";

it("refreshes the release list, as a task joining a feature can take its release", () => {
  const queryClient = new QueryClient();
  for (const queryKey of [
    ["tasks", "p"],
    ["releases", "p"],
    ["project-features", "p"],
    ["task", "t1"],
    ["activities", "t1"],
    ["release-link-candidates", "p", "r", "task", "", 1],
  ])
    queryClient.setQueryData(queryKey, {});

  invalidateFeatureChange(queryClient, "p", ["t1", null]);

  for (const queryKey of [
    ["tasks", "p"],
    ["releases", "p"],
    ["project-features", "p"],
    ["task", "t1"],
    ["activities", "t1"],
    ["release-link-candidates", "p", "r", "task", "", 1],
  ])
    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
});
