import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ProjectRoute } from "@/components/project/views/project-views";
import { HttpError } from "@/lib/http-error";
import { useUserPreferencesStore } from "@/store/user-preferences";
import ProjectLayout from "./project-layout";

const project = vi.hoisted(() => ({
  current: { data: undefined, error: null } as {
    data: { name: string } | undefined;
    error: unknown;
  },
  canCreate: true,
  shortcuts: vi.fn(),
  creation: {} as {
    open: boolean;
    type: string;
    projectId: string;
    status?: string;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/board" }),
  useRouter: () => ({
    buildLocation: ({ to }: { to: string }) => ({ href: to }),
  }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/project/views/use-project-view-shortcuts", () => ({
  useProjectViewShortcuts: (...args: unknown[]) => project.shortcuts(...args),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: () => project.current,
}));
vi.mock("@/hooks/use-project-websocket", () => ({
  useProjectWebSocket: () => undefined,
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canCreateTasks: () => project.canCreate }),
}));
vi.mock("@/components/common/layout", () => {
  const Layout = ({ children }: { children: ReactNode }) => <>{children}</>;
  Layout.Header = ({ children }: { children: ReactNode }) => <>{children}</>;
  Layout.Content = ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  );
  return { default: Layout };
});
vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => null }));
vi.mock("@/components/common/header/mobile-project-nav", () => ({
  default: () => null,
}));
vi.mock("@/components/common/header/project-crumb-select", () => ({
  default: () => null,
}));
vi.mock("@/components/common/header/workspace-crumb-select", () => ({
  default: () => null,
}));
vi.mock("@/components/shared/modals/create-project-modal", () => ({
  default: () => null,
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: (props: typeof project.creation) => {
    project.creation = props;
    return props.open ? <div role="dialog">{props.type}</div> : null;
  },
}));
vi.mock("@/components/task/milestones/milestone-details-sheet", () => ({
  MilestoneDetailsSheet: () => null,
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  localStorage.removeItem("user-preferences");
  useUserPreferencesStore.setState({ viewMode: "board", taskLayout: "board" });
  project.canCreate = true;
  project.shortcuts.mockClear();
});

function renderLayout(activeView: ProjectRoute = "board") {
  render(
    <ProjectLayout
      projectId="project-1"
      workspaceId="workspace-1"
      activeView={activeView}
      toolbar={<button type="button">Toolbar action</button>}
      summary={<span>5 tasks</span>}
    >
      <p>Board content</p>
    </ProjectLayout>,
  );
}

describe("ProjectLayout access states", () => {
  it("replaces the board with a no-access state on 403", () => {
    project.current = { data: undefined, error: new HttpError(403, "denied") };
    renderLayout();

    expect(
      screen.getByRole("heading", {
        name: "workspace:projects.unavailable.noAccessTitle",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "workspace:projects.unavailable.backToWorkspace",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Board content")).toBeNull();
    expect(screen.queryByText("Toolbar action")).toBeNull();
    expect(project.shortcuts).toHaveBeenLastCalledWith(
      expect.any(Function),
      "board",
      false,
    );
  });

  it("shows a not-found state on 404", () => {
    project.current = { data: undefined, error: new HttpError(404, "gone") };
    renderLayout();

    expect(
      screen.getByRole("heading", {
        name: "workspace:projects.unavailable.notFoundTitle",
      }),
    ).toBeVisible();
  });

  it("renders the project when it loads", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    renderLayout();

    expect(screen.getByText("Board content")).toBeVisible();
    expect(screen.getByText("Toolbar action")).toBeVisible();
    expect(screen.getByText("5 tasks")).toBeVisible();
  });

  it("keeps the toolbar and shortcuts without horizontal navigation", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    renderLayout();

    expect(
      screen.queryByRole("navigation", { name: "tasks:view.heading" }),
    ).toBeNull();
    for (const name of [
      "tasks:title",
      "tasks:view.backlog",
      "tasks:features.library.title",
      "tasks:view.releases",
    ])
      expect(screen.queryByRole("link", { name })).toBeNull();
    expect(screen.getByText("Toolbar action")).toBeVisible();
    expect(screen.getByText("5 tasks")).toBeVisible();
    expect(project.shortcuts).toHaveBeenLastCalledWith(
      expect.any(Function),
      "board",
      true,
    );
  });
});

describe("ProjectLayout toolbar", () => {
  it("wraps its remaining controls on phones", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    renderLayout("backlog");
    const toolbar = screen
      .getByRole("button", { name: "Toolbar action" })
      .closest('[data-slot="project-toolbar"]');
    expect(toolbar).toHaveClass("flex-wrap", "sm:flex-nowrap");
    expect(
      screen.queryByRole("navigation", { name: "tasks:view.heading" }),
    ).toBeNull();
  });

  it("omits an empty toolbar while retaining filters and content", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    const { container } = render(
      <ProjectLayout
        projectId="project-1"
        workspaceId="workspace-1"
        activeView="releases"
        filterBar={<button type="button">Filter release</button>}
      >
        <p>Release content</p>
      </ProjectLayout>,
    );
    expect(container.querySelector('[data-slot="project-toolbar"]')).toBeNull();
    expect(
      screen.getByRole("button", { name: "Filter release" }),
    ).toBeVisible();
    expect(screen.getByText("Release content")).toBeVisible();
    expect(project.shortcuts).toHaveBeenLastCalledWith(
      expect.any(Function),
      "releases",
      true,
    );
  });

  it("omits an otherwise empty task toolbar when creation is unavailable", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    project.canCreate = false;
    const { container } = render(
      <ProjectLayout
        projectId="project-1"
        workspaceId="workspace-1"
        activeView="board"
      >
        <p>Task content</p>
      </ProjectLayout>,
    );
    expect(container.querySelector('[data-slot="project-toolbar"]')).toBeNull();
    expect(screen.getByText("Task content")).toBeVisible();
  });

  it("keeps the last task layout while Releases is open", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    useUserPreferencesStore.setState({ taskLayout: "gantt" });
    renderLayout("releases");
    expect(useUserPreferencesStore.getState().taskLayout).toBe("gantt");
  });
});

describe("ProjectLayout tasks view", () => {
  it.each(["board", "calendar", "gantt", "backlog"] as const)(
    "creates the selected type from the %s header",
    (view) => {
      project.current = { data: { name: "Alpha" }, error: null };
      renderLayout(view);
      fireEvent.click(
        screen.getByRole("button", { name: "tasks:createMenu.label" }),
      );
      fireEvent.click(
        screen.getByRole("menuitem", { name: "tasks:createMenu.newBug" }),
      );
      expect(project.creation).toMatchObject({
        open: true,
        type: "bug",
        projectId: "project-1",
        status: view === "backlog" ? "planned" : undefined,
      });
    },
  );

  it("leaves release creation to its contextual header", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    renderLayout("releases");
    expect(
      screen.queryByRole("button", { name: "tasks:createMenu.label" }),
    ).toBeNull();
  });

  it("hides header creation without permission", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    project.canCreate = false;
    renderLayout();
    expect(
      screen.queryByRole("button", { name: "tasks:createMenu.label" }),
    ).toBeNull();
  });

  it("returns from the backlog to a task view reached by a link", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    useUserPreferencesStore.setState({ viewMode: "list", taskLayout: "gantt" });

    renderLayout("board");
    expect(useUserPreferencesStore.getState().taskLayout).toBe("list");
    cleanup();
    renderLayout("backlog");

    expect(useUserPreferencesStore.getState().taskLayout).toBe("list");
  });

  it("keeps the last task view while the backlog is open", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    useUserPreferencesStore.setState({ taskLayout: "calendar" });

    renderLayout("backlog");

    expect(useUserPreferencesStore.getState().taskLayout).toBe("calendar");
    expect(project.shortcuts).toHaveBeenLastCalledWith(
      expect.any(Function),
      "backlog",
      true,
    );
  });
});
