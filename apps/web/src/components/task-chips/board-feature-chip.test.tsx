import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";
import { BoardFeatureChip } from "./board-feature-chip";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { title?: string }) =>
      values?.title ? `${key}|${values.title}` : key,
  }),
}));

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    projectId: "p",
    status: "todo",
    type: "task",
    featureId: null,
    ...values,
  }) as Task;

const board = (featureTitle = "Checkout") =>
  ({
    id: "p",
    slug: "P",
    columns: [
      {
        id: "todo",
        slug: "todo",
        tasks: [
          task("cart", { featureId: "checkout" }),
          task("other", { title: "Other" }),
        ],
      },
    ],
    plannedTasks: [],
    archivedTasks: [
      task("checkout", {
        title: featureTitle,
        type: "feature",
        status: "archived",
      }),
    ],
  }) as unknown as ProjectWithTasks;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient();
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

it("shows the feature's title from the cached board and opens the feature", () => {
  queryClient.setQueryData(["tasks", "p"], board());
  render(<BoardFeatureChip projectId="p" featureId="checkout" />, { wrapper });

  fireEvent.click(
    screen.getByRole("button", { name: "tasks:features.chipLabel|Checkout" }),
  );
  expect(navigate).toHaveBeenCalledWith({
    to: ".",
    search: { taskId: "checkout" },
  });
});

it("follows board changes and shows nothing for an unknown feature", () => {
  render(<BoardFeatureChip projectId="p" featureId="checkout" />, { wrapper });
  expect(screen.queryByRole("button")).not.toBeInTheDocument();

  act(() => queryClient.setQueryData(["tasks", "p"], board("Payments")));
  expect(screen.getByRole("button")).toHaveTextContent("Payments");

  act(() =>
    queryClient.setQueryData(["tasks", "p"], {
      ...board(),
      archivedTasks: [],
    }),
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("leaves the board query's own fetcher in place", async () => {
  const fetchBoard = vi.fn(async () => board("Fetched"));
  const observer = new QueryObserver(queryClient, {
    queryKey: ["tasks", "p"],
    queryFn: fetchBoard,
  });
  const unsubscribe = observer.subscribe(() => {});
  await vi.waitFor(() =>
    expect(queryClient.getQueryState(["tasks", "p"])?.status).toBe("success"),
  );

  const { rerender } = render(
    <BoardFeatureChip projectId="p" featureId="checkout" />,
    { wrapper },
  );
  rerender(<BoardFeatureChip projectId="p" featureId="checkout" />);
  await act(() => queryClient.invalidateQueries({ queryKey: ["tasks", "p"] }));

  expect(fetchBoard).toHaveBeenCalledTimes(2);
  expect(queryClient.getQueryState(["tasks", "p"])?.status).toBe("success");
  expect(screen.getByRole("button")).toHaveTextContent("Fetched");
  unsubscribe();
});
