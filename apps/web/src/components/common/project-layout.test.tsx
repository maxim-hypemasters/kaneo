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
  useProjectViewShortcuts: () => undefined,
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
vi.mock("@/components/page-title", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  localStorage.removeItem("user-preferences");
  useUserPreferencesStore.setState({ viewMode: "board", taskLayout: "board" });
  project.canCreate = true;
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

  it("marks tasks as current and links the backlog", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    renderLayout();

    expect(
      screen
        .getByRole("link", { name: "tasks:title" })
        .getAttribute("aria-current"),
    ).toBe("page");
    const backlog = screen.getByRole("link", { name: "tasks:view.backlog" });
    expect(backlog.getAttribute("aria-current")).toBeNull();
    expect(backlog.getAttribute("href")).toBe(
      "/dashboard/workspace/$workspaceId/project/$projectId/backlog",
    );
  });
});

describe("ProjectLayout releases", () => {
  it("links Releases next to Tasks and Backlog", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    renderLayout();

    const links = screen
      .getByRole("navigation", { name: "tasks:view.heading" })
      .querySelectorAll("a");
    expect([...links].map((link) => link.textContent)).toEqual([
      "tasks:title",
      "tasks:view.backlog",
      "tasks:view.releases",
    ]);
    const releases = screen.getByRole("link", { name: "tasks:view.releases" });
    expect(releases.getAttribute("aria-current")).toBeNull();
    expect(releases.getAttribute("href")).toBe(
      "/dashboard/workspace/$workspaceId/project/$projectId/releases",
    );
  });

  it("wraps the toolbar below the view links on phones instead of scrolling them", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    renderLayout("backlog");

    const nav = screen.getByRole("navigation", { name: "tasks:view.heading" });
    // A scrolling nav with a hidden scrollbar cut Releases off at 375px.
    expect(nav.className).not.toMatch(/overflow-(x-)?(auto|scroll)/);
    expect(nav).not.toHaveClass("shrink-0");
    expect(nav.parentElement).toHaveClass("flex-wrap", "sm:flex-nowrap");
    for (const link of nav.querySelectorAll("a")) {
      expect(link.firstElementChild).toHaveClass("truncate");
    }
  });

  it("marks Releases as current and keeps the last task view", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    useUserPreferencesStore.setState({ taskLayout: "gantt" });

    renderLayout("releases");

    expect(
      screen
        .getByRole("link", { name: "tasks:view.releases" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: "tasks:title" })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(useUserPreferencesStore.getState().taskLayout).toBe("gantt");
    expect(
      screen.getByRole("link", { name: "tasks:title" }).getAttribute("href"),
    ).toBe("/dashboard/workspace/$workspaceId/project/$projectId/gantt");
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

    expect(
      screen.getByRole("link", { name: "tasks:title" }).getAttribute("href"),
    ).toBe("/dashboard/workspace/$workspaceId/project/$projectId/board");
  });

  it("keeps the last task view while the backlog is open", () => {
    project.current = { data: { name: "Alpha" }, error: null };
    useUserPreferencesStore.setState({ taskLayout: "calendar" });

    renderLayout("backlog");

    expect(useUserPreferencesStore.getState().taskLayout).toBe("calendar");
    expect(
      screen.getByRole("link", { name: "tasks:title" }).getAttribute("href"),
    ).toBe("/dashboard/workspace/$workspaceId/project/$projectId/calendar");
  });
});
