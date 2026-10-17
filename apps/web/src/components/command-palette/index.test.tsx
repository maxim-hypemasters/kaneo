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
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: m.pathname }),
  useNavigate: () => vi.fn(),
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
  }) =>
    props.open ? (
      <div
        role="dialog"
        aria-label={`create-${props.type}`}
        data-project={props.projectId}
        data-status={props.status}
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
});
