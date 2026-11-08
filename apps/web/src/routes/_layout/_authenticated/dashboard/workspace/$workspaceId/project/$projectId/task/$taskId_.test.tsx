import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { Route } from "./$taskId_";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  task: undefined as Record<string, unknown> | undefined,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({
      workspaceId: "workspace-1",
      projectId: "project-1",
      taskId: "item-1",
    }),
    useSearch: () => ({}),
  }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: mocks.task, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { slug: "KAN" }, isLoading: false }),
}));
vi.mock("@/lib/shiki-highlighter", () => ({
  getSharedShikiHighlighter: () => Promise.resolve(),
}));
vi.mock("@/components/editor/document-draft-guard", () => ({
  DocumentDraftGuardProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
vi.mock("@/components/common/task-layout", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/task/task-details-content", () => ({
  default: () => <p>Task details</p>,
}));
vi.mock("@/components/task/header/task-header-actions", () => ({
  TaskHeaderActions: () => null,
}));
vi.mock("@/components/task/properties/properties-rail", () => ({
  PropertiesRail: () => null,
}));
vi.mock("@/components/task/properties/property-chips", () => ({
  PropertyChips: () => null,
}));
vi.mock("@/components/task/task-shortcuts", () => ({
  TaskShortcuts: () => null,
}));
vi.mock("@/components/task/task-delete-dialog", () => ({
  default: ({ onDeleted }: { onDeleted: () => void }) => (
    <button type="button" onClick={onDeleted}>
      Confirm delete
    </button>
  ),
}));

const RouteComponent = (Route as unknown as { component: ComponentType })
  .component;

const task = {
  id: "item-1",
  number: 12,
  title: "Billing",
  projectId: "project-1",
  type: "task",
};

beforeEach(() => {
  mocks.task = task;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.title = "";
});

async function deleteItem() {
  render(<RouteComponent />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirm delete" }),
  );
}

describe("full-page task route", () => {
  it("returns to the Features library after deleting a feature", async () => {
    mocks.task = { ...task, type: "feature" };

    await deleteItem();

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/features",
      params: { workspaceId: "workspace-1", projectId: "project-1" },
      replace: true,
    });
  });

  it("returns to the project after deleting a task", async () => {
    await deleteItem();

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId",
      params: { workspaceId: "workspace-1", projectId: "project-1" },
      replace: true,
    });
  });

  it.each([
    ["task", "tasks:common.loadingTask"],
    ["feature", "tasks:features.window.loading"],
  ])("titles a loading %s by its type", async (type, title) => {
    mocks.task = { ...task, type };
    render(<RouteComponent />);

    expect(document.title).toBe(title);
    await act(async () => {});
    await waitFor(() => expect(document.title).toBe("KAN-12 · Billing"));
  });
});
