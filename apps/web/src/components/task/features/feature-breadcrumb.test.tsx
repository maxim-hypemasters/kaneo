import {
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
import {
  type FeatureIndex,
  getFeatureIndex,
} from "@/lib/features/feature-index";
import type Task from "@/types/task";
import { FeatureBreadcrumb } from "./feature-breadcrumb";
import { TaskReleaseOriginProvider } from "../task-release-origin-context";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  updateFeature: vi.fn(),
  toastError: vi.fn(),
  canUpdateTasks: vi.fn(),
  featureIndex: undefined as unknown as FeatureIndex,
  relations: { data: [] as unknown[], isSuccess: true },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/hooks/mutations/task/use-update-task-feature", () => ({
  useUpdateTaskFeature: () => ({
    mutateAsync: mocks.updateFeature,
    isPending: false,
  }),
}));
vi.mock("@/hooks/queries/task/use-feature-index", () => ({
  useFeatureIndex: () => mocks.featureIndex,
}));
vi.mock("@/hooks/queries/task-relation/use-get-task-relations", () => ({
  default: () => mocks.relations,
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [{ id: "project-1", slug: "WEB" }] }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: mocks.canUpdateTasks }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError } }));

const task: Pick<Task, "id" | "projectId" | "featureId"> = {
  id: "cart",
  projectId: "project-1",
  featureId: "checkout",
};
const feature = {
  id: "checkout",
  title: "Checkout",
  number: 3,
  projectId: "project-1",
  type: "feature",
  featureId: null,
} as Task;

function renderBreadcrumb(values: Partial<typeof task> = {}) {
  return render(
    <FeatureBreadcrumb
      task={{ ...task, ...values }}
      workspaceId="workspace-1"
    />,
  );
}

beforeEach(() => {
  mocks.canUpdateTasks.mockReturnValue(true);
  mocks.featureIndex = getFeatureIndex({ columns: [{ tasks: [feature] }] });
  mocks.relations = { data: [], isSuccess: true };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const openFeatureName = `tasks:features.openFeature ${JSON.stringify({ title: "WEB-3 Checkout" })}`;

describe("FeatureBreadcrumb", () => {
  it("names the task's feature and opens it in its project", () => {
    renderBreadcrumb();

    const open = screen.getByRole("button", { name: openFeatureName });
    expect(open).toHaveTextContent("tasks:detail.subtaskOfWEB-3Checkout");
    fireEvent.click(open);
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          workspaceId: "workspace-1",
          projectId: "project-1",
          taskId: "checkout",
        },
      }),
    );
  });

  it("finds the feature through the task's relations without a board", () => {
    mocks.featureIndex = getFeatureIndex(undefined);
    mocks.relations = {
      isSuccess: true,
      data: [
        {
          id: "feature:cart:checkout",
          relationType: "subtask",
          sourceTaskId: "checkout",
          targetTaskId: "cart",
          sourceTask: { ...feature, status: "to-do", isCompleted: false },
          targetTask: { id: "cart", title: "Cart", projectId: "project-1" },
        },
      ],
    };
    renderBreadcrumb();

    expect(
      screen.getByRole("button", { name: openFeatureName }),
    ).toBeInTheDocument();
  });

  it("retains release context when navigating to a Feature in the same project", () => {
    render(
      <TaskReleaseOriginProvider
        origin={{ projectId: "project-1", releaseId: "release-1" }}
      >
        <FeatureBreadcrumb task={task} workspaceId="workspace-1" />
      </TaskReleaseOriginProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: openFeatureName }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: { originReleaseId: "release-1" },
      }),
    );
  });

  it("does not carry another project's release into Feature navigation", () => {
    render(
      <TaskReleaseOriginProvider
        origin={{ projectId: "another-project", releaseId: "release-1" }}
      >
        <FeatureBreadcrumb task={task} workspaceId="workspace-1" />
      </TaskReleaseOriginProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: openFeatureName }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: {} }),
    );
  });

  it("takes the task out of its feature", async () => {
    mocks.updateFeature.mockResolvedValue({});
    renderBreadcrumb();

    fireEvent.click(
      screen.getByRole("button", { name: "tasks:features.remove" }),
    );

    await waitFor(() =>
      expect(mocks.updateFeature).toHaveBeenCalledWith({
        task,
        featureId: null,
      }),
    );
  });

  it("reports a failed removal", async () => {
    mocks.updateFeature.mockRejectedValue(new Error("Conflict"));
    renderBreadcrumb();

    fireEvent.click(
      screen.getByRole("button", { name: "tasks:features.remove" }),
    );

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Conflict"),
    );
  });

  it("offers no removal without update permission", () => {
    mocks.canUpdateTasks.mockReturnValue(false);
    renderBreadcrumb();

    expect(
      screen.queryByRole("button", { name: "tasks:features.remove" }),
    ).not.toBeInTheDocument();
  });

  it("shows nothing for a task outside a feature", () => {
    const { container } = renderBreadcrumb({ featureId: null });

    expect(container).toBeEmptyDOMElement();
  });
});
