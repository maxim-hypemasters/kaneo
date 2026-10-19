import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createMilestone } from "@/fetchers/milestone/milestones";
import { HttpError } from "@/lib/http-error";
import { useMilestoneMutations } from "./use-milestone-mutations";
vi.mock("@/fetchers/milestone/milestones", () => ({
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  reorderMilestones: vi.fn(),
  setTaskMilestone: vi.fn(),
}));
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const keys = [
  ["feature-milestones", "p", "f"],
  ["feature-milestones", "p", "f", "task-candidates"],
  ["tasks", "p"],
  ["task-relations", "f"],
  ["task", "t"],
  ["activities", "t"],
  ["task-relations", "t"],
];
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  for (const key of keys) client.setQueryData(key, []);
  client.setQueryData(["feature-milestones", "other", "f2"], []);
  vi.clearAllMocks();
});
afterEach(() => client.clear());
it("refreshes the new/old milestone counts and selected work after atomic creation", async () => {
  vi.mocked(createMilestone).mockResolvedValue({ id: "m" } as never);
  const { result } = renderHook(() => useMilestoneMutations("p", "f"), {
    wrapper,
  });
  await act(async () => {
    await result.current.create.mutateAsync({
      title: "Launch",
      taskIds: ["t"],
    });
  });
  for (const key of keys)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(
    client.getQueryState(["feature-milestones", "other", "f2"])?.isInvalidated,
  ).toBe(false);
});
it("refreshes candidates after a stale selection without invalidating task values", async () => {
  vi.mocked(createMilestone).mockRejectedValue(new HttpError(409, "changed"));
  const { result } = renderHook(() => useMilestoneMutations("p", "f"), {
    wrapper,
  });
  await act(async () => {
    await result.current.create
      .mutateAsync({ title: "Launch", taskIds: ["t"] })
      .catch(() => undefined);
  });
  expect(client.getQueryState(keys[1])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["task", "t"])?.isInvalidated).toBe(false);
});
