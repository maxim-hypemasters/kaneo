import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { ProjectSidebarMenu } from "./project-sidebar-menu";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), closeMobile: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({
    buildLocation: ({
      to,
      params,
    }: {
      to: string;
      params: { workspaceId: string; projectId: string };
    }) => ({
      href: to
        .replace("$workspaceId", params.workspaceId)
        .replace("$projectId", params.projectId),
    }),
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, args?: { name?: string }) =>
      args?.name ? `${key}: ${args.name}` : key,
  }),
}));
vi.mock("@/components/ui/sidebar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/sidebar")>()),
  useSidebar: () => ({ setOpenMobile: mocks.closeMobile }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useUserPreferencesStore.setState({ taskLayout: "board", viewMode: "board" });
});
afterEach(() => {
  cleanup();
  localStorage.removeItem("user-preferences");
});

function menu(
  activeScope: "tasks" | "backlog" | "features" | "releases" | null = "tasks",
  projectId = "p",
) {
  return render(
    <ProjectSidebarMenu
      workspaceId="w"
      projectId={projectId}
      projectName="Alpha"
      activeScope={activeScope}
    />,
  );
}

describe("project sidebar destinations", () => {
  it("renders the four destinations in order with the current destination marked", () => {
    menu("features");
    const nav = screen.getByRole("navigation", {
      name: "navigation:projectList.navigationLabel: Alpha",
    });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "tasks:title",
      "tasks:view.backlog",
      "tasks:features.library.title",
      "tasks:view.releases",
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([
      null,
      null,
      "page",
      null,
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dashboard/workspace/w/project/p/board",
      "/dashboard/workspace/w/project/p/backlog",
      "/dashboard/workspace/w/project/p/features",
      "/dashboard/workspace/w/project/p/releases",
    ]);
  });

  it("does not mark a destination for another expanded project", () => {
    menu(null, "other");
    for (const link of screen.getAllByRole("link"))
      expect(link).not.toHaveAttribute("aria-current");
  });

  it.each(["calendar", "gantt"] as const)(
    "returns Tasks to the remembered %s layout",
    (taskLayout) => {
      useUserPreferencesStore.setState({ taskLayout, viewMode: "list" });
      menu("releases");
      const tasks = screen.getByRole("link", { name: "tasks:title" });
      expect(tasks).toHaveAttribute(
        "href",
        `/dashboard/workspace/w/project/p/${taskLayout}`,
      );
      fireEvent.click(tasks);
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
        to: `/dashboard/workspace/$workspaceId/project/$projectId/${taskLayout}`,
        params: { workspaceId: "w", projectId: "p" },
        search: {},
      });
      expect(useUserPreferencesStore.getState().taskLayout).toBe(taskLayout);
      expect(mocks.closeMobile).toHaveBeenCalledExactlyOnceWith(false);
    },
  );

  it("preserves list mode on the board route", () => {
    useUserPreferencesStore.setState({ taskLayout: "board", viewMode: "list" });
    menu("backlog");
    fireEvent.click(screen.getByRole("link", { name: "tasks:title" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      }),
    );
    expect(useUserPreferencesStore.getState()).toMatchObject({
      taskLayout: "list",
      viewMode: "list",
    });
  });

  it("always navigates Releases to its list and closes the drawer, including the current route", () => {
    useUserPreferencesStore.setState({ taskLayout: "gantt" });
    menu("releases");
    fireEvent.click(screen.getByRole("link", { name: "tasks:view.releases" }));
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/releases",
      params: { workspaceId: "w", projectId: "p" },
      search: {},
    });
    expect(useUserPreferencesStore.getState().taskLayout).toBe("gantt");
    expect(mocks.closeMobile).toHaveBeenCalledWith(false);
  });

  it("navigates to another project even if that project's view matches the current route", () => {
    menu(null, "other");
    fireEvent.click(screen.getByRole("link", { name: "tasks:view.backlog" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/backlog",
      params: { workspaceId: "w", projectId: "other" },
      search: {},
    });
  });

  it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"])(
    "preserves native %s navigation without changing preferences or closing mobile",
    (modifier) => {
      useUserPreferencesStore.setState({ taskLayout: "gantt" });
      menu();
      const link = screen.getByRole("link", { name: "tasks:title" });
      // Cancel the browser's default only after checking React did not intercept it.
      let defaultPrevented = true;
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        [modifier]: true,
      });
      document.addEventListener(
        "click",
        (received) => {
          defaultPrevented = received.defaultPrevented;
          received.preventDefault();
        },
        { once: true },
      );
      fireEvent(link, event);
      expect(defaultPrevented).toBe(false);
      expect(mocks.navigate).not.toHaveBeenCalled();
      expect(mocks.closeMobile).not.toHaveBeenCalled();
      expect(useUserPreferencesStore.getState().taskLayout).toBe("gantt");
    },
  );
});
