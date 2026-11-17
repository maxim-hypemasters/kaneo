import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { invalidateAfterAssistantWrite } from "./invalidate-after-assistant-write";

let queryClient: QueryClient;
afterEach(() => queryClient.clear());

it("refreshes every query outside the assistant's, inactive ones too", async () => {
  queryClient = new QueryClient();
  const fetched: string[] = [];
  const seed = (queryKey: unknown[]) => {
    queryClient.setQueryDefaults(queryKey, {
      queryFn: () => {
        fetched.push(JSON.stringify(queryKey));
        return {};
      },
    });
    queryClient.setQueryData(queryKey, {});
  };
  for (const queryKey of [
    ["tasks", "p1"],
    ["project-pages", "p1"],
    ["task", "t1"],
    ["assistant", "chat", "ws1", "c1"],
    ["assistant", "chats", "ws1"],
  ])
    seed(queryKey);
  // An observed query is active; the rest are cached in the background.
  const observer = new QueryObserver(queryClient, {
    queryKey: ["tasks", "p1"],
    staleTime: Number.POSITIVE_INFINITY,
  });
  const unsubscribe = observer.subscribe(() => {});

  invalidateAfterAssistantWrite(queryClient);

  for (const queryKey of [
    ["tasks", "p1"],
    ["project-pages", "p1"],
    ["task", "t1"],
  ])
    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
  for (const queryKey of [
    ["assistant", "chat", "ws1", "c1"],
    ["assistant", "chats", "ws1"],
  ])
    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(false);

  await vi.waitFor(() =>
    expect(fetched.sort()).toEqual(
      ['["project-pages","p1"]', '["task","t1"]', '["tasks","p1"]'].sort(),
    ),
  );
  unsubscribe();
});
