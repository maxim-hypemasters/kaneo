import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import getReleases from "@/fetchers/release/get-releases";
import type { Release } from "@/types/release";
import { useTaskFilterOptions } from "./use-task-filter-options";

vi.mock("@/fetchers/release/get-releases", () => ({ default: vi.fn() }));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => {
    const users = { data: { members: [] } };
    return { useGetActiveWorkspaceUsers: () => users };
  },
);
vi.mock("@/hooks/queries/label/use-get-labels-by-workspace", () => {
  const labels = { data: [] };
  return { default: () => labels };
});
vi.mock("@/hooks/queries/custom-field/use-get-custom-fields-by-project", () => {
  const fields = { data: [] };
  return { default: () => fields };
});
vi.mock(
  "@/hooks/queries/custom-field/use-get-custom-field-filter-values",
  () => {
    const values = { data: [] };
    return { default: () => values };
  },
);

const release = (
  id: string,
  completed: number,
  values: Partial<Release> = {},
): Release => ({
  id,
  projectId: "p",
  name: id,
  description: null,
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-10",
  submissionDate: "2026-10-20",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  progress: {
    tasks: { total: 5, completed },
    features: { total: 0, completed: 0 },
    unfinished: 5 - completed,
  },
  ...values,
});

let queryClient: QueryClient;
// React Query tells observers in a later task, not synchronously.
const setReleases = async (releases: Release[]) => {
  await act(async () => {
    queryClient.setQueryData(["releases", "p"], releases);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.mocked(getReleases).mockResolvedValue([release("2.4", 1)]);
});
afterEach(() => queryClient.clear());

it("offers releases without progress, and keeps them when only progress changes", async () => {
  let renders = 0;
  const { result } = renderHook(
    () => {
      renders += 1;
      return useTaskFilterOptions("p", "w");
    },
    { wrapper },
  );
  await waitFor(() => expect(result.current.releases).toHaveLength(1));
  const releases = result.current.releases;
  expect(releases[0]).not.toHaveProperty("progress");
  const rendersBefore = renders;

  // A teammate completes a task in 2.4; the list is read again.
  await setReleases([release("2.4", 2)]);
  expect(result.current.releases).toBe(releases);
  expect(renders).toBe(rendersBefore);

  await setReleases([release("2.4", 2, { name: "2.4.1" })]);
  expect(result.current.releases[0].name).toBe("2.4.1");
  expect(renders).toBeGreaterThan(rendersBefore);
});
