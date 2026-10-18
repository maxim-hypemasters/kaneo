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
import CommandPalette from "./index";

const m = vi.hoisted(() => ({
  shortcuts: new Map<string, () => void>(),
  pathname: "/dashboard/workspace/workspace-1",
  navigate: vi.fn(),
  canManageReleases: true,
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: m.pathname }),
  useNavigate: () => m.navigate,
}));
vi.mock("@/components/releases/use-release-permissions", () => ({
  useReleasePermissions: () => ({ canManage: m.canManageReleases }),
}));
vi.mock("@/components/releases/dialog/release-dialog", () => ({
  ReleaseDialog: (props: {
    open: boolean;
    projectId: string;
    onCreated?: (release: { id: string; projectId: string }) => void;
  }) =>
    props.open ? (
      <div
        role="dialog"
        aria-label="create-release"
        data-project={props.projectId}
      >
        <button
          type="button"
          onClick={() =>
            props.onCreated?.({ id: "release-9", projectId: props.projectId })
          }
        >
          created
        </button>
      </div>
    ) : null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/shortcuts/use-shortcut", () => ({
  useShortcut: (id: string, handler: () => void) => {
    m.shortcuts.set(id, handler);
  },
}));
vi.mock("@/components/shortcuts/shortcut-keys", () => ({
  ShortcutKeys: () => null,
}));
vi.mock("@/components/search-command-menu", () => ({ default: () => null }));
vi.mock("@/components/shared/modals/create-workspace-modal", () => ({
  default: () => null,
}));
vi.mock("@/components/shared/modals/create-project-modal", () => ({
  default: () => null,
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: (props: {
    open: boolean;
    type?: string;
    projectId?: string;
    status?: string;
    releaseId?: string;
  }) =>
    props.open ? (
      <div
        role="dialog"
        aria-label={`create-${props.type}`}
        data-project={props.projectId}
        data-status={props.status}
        data-release={props.releaseId}
      />
    ) : null,
}));
vi.mock("@/hooks/queries/config/use-get-config", () => ({
  default: () => ({ data: { disableWorkspaceCreation: false } }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace-1" } }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));

beforeEach(() => {
  m.shortcuts.clear();
  m.pathname = "/dashboard/workspace/workspace-1";
  m.navigate.mockReset();
  m.canManageReleases = true;
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function runCommand(label: string) {
  render(<CommandPalette />);
  act(() => m.shortcuts.get("openCommandMenu")?.());
  await act(async () => {
    fireEvent.click(await screen.findByText(label));
  });
}

describe("CommandPalette", () => {
  it("creates a feature from its command", async () => {
    await runCommand("navigation:commandPalette.createFeature");

    expect(
      await screen.findByRole("dialog", { name: "create-feature" }),
    ).toBeInTheDocument();
  });

  it("creates the feature in the project and backlog the route is on", async () => {
    m.pathname = "/dashboard/workspace/workspace-1/project/project-1/backlog";
    await runCommand("navigation:commandPalette.createFeature");

    const dialog = await screen.findByRole("dialog", {
      name: "create-feature",
    });
    expect(dialog).toHaveAttribute("data-project", "project-1");
    expect(dialog).toHaveAttribute("data-status", "planned");
  });

  it("still creates a task from its command", async () => {
    await runCommand("navigation:commandPalette.createTask");

    expect(
      await screen.findByRole("dialog", { name: "create-task" }),
    ).toBeInTheDocument();
  });

  it("still creates a task from its shortcut", () => {
    render(<CommandPalette />);
    act(() => m.shortcuts.get("createTask")?.());

    expect(
      screen.getByRole("dialog", { name: "create-task" }),
    ).toBeInTheDocument();
  });

  it("starts a task created on a release's page in that release", async () => {
    m.pathname =
      "/dashboard/workspace/workspace-1/project/project-1/releases/release-1";
    await runCommand("navigation:commandPalette.createTask");

    const dialog = await screen.findByRole("dialog", { name: "create-task" });
    expect(dialog).toHaveAttribute("data-project", "project-1");
    expect(dialog).toHaveAttribute("data-release", "release-1");
  });

  it("creates a task without a release elsewhere", async () => {
    m.pathname = "/dashboard/workspace/workspace-1/project/project-1/releases";
    await runCommand("navigation:commandPalette.createTask");

    const dialog = await screen.findByRole("dialog", { name: "create-task" });
    expect(dialog).not.toHaveAttribute("data-release");
  });
});

describe("CommandPalette releases", () => {
  it("goes to the project's releases", async () => {
    m.pathname = "/dashboard/workspace/workspace-1/project/project-1/board";
    await runCommand("navigation:commandPalette.goToReleases");

    expect(m.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/releases",
      params: { workspaceId: "workspace-1", projectId: "project-1" },
    });
  });

  it("creates a release and opens it", async () => {
    m.pathname = "/dashboard/workspace/workspace-1/project/project-1/gantt";
    await runCommand("navigation:commandPalette.createRelease");

    const dialog = await screen.findByRole("dialog", {
      name: "create-release",
    });
    expect(dialog).toHaveAttribute("data-project", "project-1");
    fireEvent.click(screen.getByRole("button", { name: "created" }));
    expect(m.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/releases/$releaseId",
      params: {
        workspaceId: "workspace-1",
        projectId: "project-1",
        releaseId: "release-9",
      },
    });
  });

  it("offers releases only inside a project, and creating only to managers", async () => {
    render(<CommandPalette />);
    act(() => m.shortcuts.get("openCommandMenu")?.());
    await screen.findByText("navigation:commandPalette.createTask");
    expect(
      screen.queryByText("navigation:commandPalette.goToReleases"),
    ).toBeNull();
    cleanup();

    m.pathname = "/dashboard/workspace/workspace-1/project/project-1/board";
    m.canManageReleases = false;
    render(<CommandPalette />);
    act(() => m.shortcuts.get("openCommandMenu")?.());
    expect(
      await screen.findByText("navigation:commandPalette.goToReleases"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("navigation:commandPalette.createRelease"),
    ).toBeNull();
  });
});
