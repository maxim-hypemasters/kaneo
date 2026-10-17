import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it } from "vite-plus/test";
import { findCachedFeatureId } from "./find-cached-feature-id";

const queryClient = new QueryClient();
afterEach(() => queryClient.clear());

it("reads the task's cached detail first", () => {
  queryClient.setQueryData(["task", "a"], { id: "a", featureId: "f" });
  expect(findCachedFeatureId(queryClient, "a")).toBe("f");
});

it("falls back to any cached board", () => {
  queryClient.setQueryData(["tasks", "p"], {
    columns: [{ tasks: [{ id: "b", featureId: null }] }],
    plannedTasks: [],
    archivedTasks: [{ id: "a", featureId: "f" }],
  });
  queryClient.setQueryData(["tasks", "unrelated-shape"], { items: [] });
  expect(findCachedFeatureId(queryClient, "a")).toBe("f");
  expect(findCachedFeatureId(queryClient, "b")).toBeNull();
  expect(findCachedFeatureId(queryClient, "missing")).toBeNull();
});
