import enUS from "@i18n/en-US.json";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { AlertDialogCreateHandle } from "@/components/ui/alert-dialog";
import { TaskHeaderActions } from "./task-header-actions";

const mocks = vi.hoisted(() => ({
  task: undefined as Record<string, unknown> | undefined,
  writeText: vi.fn(),
  message: vi.fn(),
  error: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const [namespace, path] = key.split(":");
      const value = path
        .split(".")
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown> | undefined)?.[part],
          (enUS as Record<string, unknown>)[namespace],
        );
      return typeof value === "string" ? value : key;
    },
  }),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: mocks.task }),
}));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => ({ data: { slug: "KAN" } }),
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: undefined }),
}));
vi.mock(
  "@/hooks/queries/github-integration/use-get-github-integration",
  () => ({ default: () => ({ data: undefined }) }),
);
vi.mock("@/hooks/queries/gitea-integration/use-get-gitea-integration", () => ({
  default: () => ({ data: undefined }),
}));
vi.mock(
  "@/hooks/queries/gitlab-integration/use-get-gitlab-integration",
  () => ({ default: () => ({ data: undefined }) }),
);
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canDeleteTasks: () => true }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { message: mocks.message, error: mocks.error },
}));

const task = {
  id: "task-1",
  number: 12,
  title: "Fix login",
  description: null,
  projectId: "project-1",
  type: "task",
};

function renderActions() {
  render(
    <TaskHeaderActions
      taskId="task-1"
      projectId="project-1"
      workspaceId="workspace-1"
      deleteHandle={AlertDialogCreateHandle()}
    />,
  );
}

async function openMoreMenu() {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  return (await screen.findAllByRole("menuitem")).map(
    (item) => item.textContent,
  );
}

beforeEach(() => {
  mocks.task = task;
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskHeaderActions", () => {
  it("offers a Task its link and branch", async () => {
    renderActions();

    expect(
      screen.getByRole("button", { name: "Copy task link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy task branch" }),
    ).toBeInTheDocument();

    const items = await openMoreMenu();
    expect(items).toEqual(
      expect.arrayContaining([
        "Copy task link",
        "Copy task branch",
        expect.stringContaining("Copy task ID"),
        expect.stringContaining("Copy task title"),
        expect.stringContaining("Delete Task"),
      ]),
    );
  });

  it("names a Feature and leaves out its branch", async () => {
    mocks.task = { ...task, type: "feature" };
    renderActions();

    expect(
      screen.queryByRole("button", { name: "Copy task branch" }),
    ).not.toBeInTheDocument();
    const copyLink = screen.getByRole("button", { name: "Copy feature link" });
    await act(async () => {
      fireEvent.click(copyLink);
    });
    expect(mocks.writeText).toHaveBeenCalledWith(
      expect.stringContaining("task-1"),
    );
    expect(mocks.message).toHaveBeenCalledWith("Copied feature link", {
      icon: expect.anything(),
    });

    const items = await openMoreMenu();
    expect(items).not.toContain("Copy task branch");
    expect(items.join(" ")).not.toMatch(/task/i);
    expect(items).toEqual(
      expect.arrayContaining([
        "Copy feature link",
        expect.stringContaining("Copy feature ID"),
        expect.stringContaining("Copy feature title"),
        expect.stringContaining("Delete feature"),
      ]),
    );
  });

  it("shows no branch action until the item is known to be a Task", () => {
    mocks.task = undefined;
    renderActions();

    expect(
      screen.queryByRole("button", { name: "Copy task branch" }),
    ).not.toBeInTheDocument();
  });

  it("says which Feature ID it copied", async () => {
    mocks.task = { ...task, type: "feature" };
    renderActions();

    await openMoreMenu();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("menuitem", { name: /Copy feature ID/ }),
      );
    });

    expect(mocks.writeText).toHaveBeenCalledWith("KAN-12");
    expect(mocks.message).toHaveBeenCalledWith("Copied feature ID", {
      icon: expect.anything(),
    });
  });
});
