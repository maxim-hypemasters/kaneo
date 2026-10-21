import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vite-plus/test";
import { invalidateReleaseLinks } from "./invalidate-release-links";
import type { ReleaseLinkCandidate } from "@/fetchers/release/get-release-link-candidates";

it("refreshes both releases and cached followers once without invalidating another project", () => {
  const client = new QueryClient();
  const keys = [
    ["tasks", "p"],
    ["releases", "p"],
    ["release-progress", "p", "source", "UTC"],
    ["release-progress", "p", "target", "UTC"],
    ["feature-milestones", "p", "project", "UTC"],
    ["release-link-candidates", "p", "r", "task", "", 1],
    ["feature-create-candidates", "p", "", 1],
    ["task", "follower"],
    ["activities", "follower"],
    ["task-relations", "feature"],
  ];
  for (const key of keys)
    client.setQueryData(key, key[0] === "task" ? { projectId: "p" } : {});
  client.setQueryData(["task", "private"], { projectId: "other" });
  client.setQueryData(["activities", "private"], {});
  client.setQueryData(["release-link-candidates", "other", "r"], {});
  const spy = vi.spyOn(client, "invalidateQueries");
  invalidateReleaseLinks(client, "p", [
    { id: "m", featureId: "feature" } as ReleaseLinkCandidate,
  ]);
  for (const key of keys)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["task", "private"])?.isInvalidated).toBe(false);
  expect(client.getQueryState(["activities", "private"])?.isInvalidated).toBe(
    false,
  );
  expect(
    client.getQueryState(["release-link-candidates", "other", "r"])
      ?.isInvalidated,
  ).toBe(false);
  expect(spy).toHaveBeenCalledTimes(12);
  client.clear();
});
