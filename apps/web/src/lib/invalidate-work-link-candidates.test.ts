import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vite-plus/test";
import { invalidateWorkLinkCandidates } from "./invalidate-work-link-candidates";

it("refreshes both candidate pickers across search pages without crossing projects", () => {
  const client = new QueryClient();
  const keys = [
    ["feature-create-candidates", "p", "", 1],
    ["feature-create-candidates", "p", "Core", 2],
    ["release-link-candidates", "p", "r", "task", "", 1],
  ];
  for (const key of [...keys, ["feature-create-candidates", "other", "", 1]])
    client.setQueryData(key, []);
  invalidateWorkLinkCandidates(client, "p");
  for (const key of keys)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(
    client.getQueryState(["feature-create-candidates", "other", "", 1])
      ?.isInvalidated,
  ).toBe(false);
  client.clear();
});
