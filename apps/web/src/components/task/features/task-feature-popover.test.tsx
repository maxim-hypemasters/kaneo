import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type Task from "@/types/task";
import type { FeatureSummary } from "./feature-lookup";
import { TaskFeaturePopover } from "./task-feature-popover";

const mocks = vi.hoisted(() => ({
  updateFeature: vi.fn(),
  toastError: vi.fn(),
  canUpdateTasks: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-feature", () => ({
  useUpdateTaskFeature: () => ({ mutateAsync: mocks.updateFeature }),
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [{ id: "project-1", slug: "WEB" }] }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: mocks.canUpdateTasks }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError } }));

const boardTask = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    number: 1,
    status: "to-do",
    projectId: "project-1",
    type: "task",
    featureId: null,
    ...values,
  }) as Task;

const board = {
  columns: [
    {
      tasks: [
        boardTask("Checkout", { type: "feature", number: 3 }),
        boardTask("Search", { type: "feature", number: 4 }),
        boardTask("Cart"),
      ],
    },
  ],
};

// The real query cache feeds both the feature index and the loading state.
let queryClient: QueryClient;
const cacheBoard = (value: unknown) =>
  queryClient.setQueryData(["tasks", "project-1"], value);

function renderPopover(
  featureId: string | null,
  feature: FeatureSummary | null | undefined = null,
) {
  render(
    <QueryClientProvider client={queryClient}>
      <TaskFeaturePopover
        task={{ id: "Cart", projectId: "project-1", featureId }}
        feature={feature}
        workspaceId="workspace-1"
      >
        <button type="button">Feature</button>
      </TaskFeaturePopover>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Feature" }));
}

async function pick(name: RegExp) {
  await act(async () => {
    fireEvent.click(await screen.findByRole("option", { name }));
  });
}

beforeEach(() => {
  mocks.canUpdateTasks.mockReturnValue(true);
  queryClient = new QueryClient();
  cacheBoard(board);
  mocks.updateFeature.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

describe("TaskFeaturePopover", () => {
  it("lists no feature, then the project's features", async () => {
    renderPopover(null);

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringMatching(/^tasks:features.none/),
      expect.stringMatching(/^CheckoutWEB-3/),
      expect.stringMatching(/^SearchWEB-4/),
    ]);
  });

  it("puts the task in the picked feature with one request", async () => {
    renderPopover(null);

    await pick(/Search/);

    await waitFor(() =>
      expect(mocks.updateFeature).toHaveBeenCalledWith({
        task: { id: "Cart", projectId: "project-1", featureId: null },
        featureId: "Search",
      }),
    );
    expect(mocks.updateFeature).toHaveBeenCalledTimes(1);
  });

  it("takes the task out with no feature", async () => {
    renderPopover("Checkout");

    await pick(/tasks:features.none/);

    await waitFor(() =>
      expect(mocks.updateFeature).toHaveBeenCalledWith(
        expect.objectContaining({ featureId: null }),
      ),
    );
  });

  it("does nothing when the current feature is picked again", async () => {
    renderPopover("Checkout");

    await pick(/Checkout/);

    expect(mocks.updateFeature).not.toHaveBeenCalled();
  });

  it("reports a rejected change", async () => {
    mocks.updateFeature.mockRejectedValue(new Error("Not a feature"));
    renderPopover(null);

    await pick(/Search/);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Not a feature"),
    );
  });

  it("offers the current feature without a cached board", async () => {
    queryClient.clear();
    renderPopover("Checkout", {
      id: "Checkout",
      title: "Checkout",
      number: 3,
      projectId: "project-1",
    });

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringMatching(/^tasks:features.none/),
      expect.stringMatching(/^CheckoutWEB-3/),
    ]);
    expect(options[1]).toHaveAttribute("aria-current", "true");
  });

  it("says when the project has no features", async () => {
    cacheBoard({ columns: [{ tasks: [boardTask("Cart")] }] });
    renderPopover(null);

    expect(await screen.findByText("tasks:features.empty")).toBeInTheDocument();
    expect(screen.queryByText("common:empty.loading")).not.toBeInTheDocument();
  });

  it("says it is loading until the board is cached", async () => {
    queryClient.clear();
    renderPopover(null);

    expect(await screen.findByText("common:empty.loading")).toBeInTheDocument();
    expect(screen.queryByText("tasks:features.empty")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    act(() => {
      cacheBoard(board);
    });

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringMatching(/^tasks:features.none/),
      expect.stringMatching(/^CheckoutWEB-3/),
      expect.stringMatching(/^SearchWEB-4/),
    ]);
    expect(screen.queryByText("common:empty.loading")).not.toBeInTheDocument();
  });

  it("stays closed without update permission", () => {
    mocks.canUpdateTasks.mockReturnValue(false);
    renderPopover(null);

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
