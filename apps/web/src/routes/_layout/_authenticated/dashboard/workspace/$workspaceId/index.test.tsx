import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { Route } from "./index";

const m = vi.hoisted(() => ({
  projects: [{ id: "project-1" }] as unknown[] | undefined,
  canCreateTasks: true,
  canCreateProjects: true,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ workspaceId: "workspace-1" }),
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
vi.mock("@/components/billing/trial-expired-callout", () => ({
  TrialExpiredCallout: () => null,
}));
vi.mock("@/components/common/workspace-layout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/home/activity-feed", () => ({
  ActivityFeed: () => null,
}));
vi.mock("@/components/home/home-projects", () => ({
  HomeProjects: () => null,
}));
vi.mock("@/components/home/up-next", () => ({ UpNext: () => null }));
vi.mock("@/components/home/week-strip", () => ({ WeekStrip: () => null }));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/components/shared/modals/create-project-modal", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="create-project" /> : null,
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: ({
    open,
    type,
    onClose,
  }: {
    open: boolean;
    type?: string;
    onClose: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={`create-${type}`}>
        <button type="button" onClick={onClose}>
          close
        </button>
      </div>
    ) : null,
}));
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: m.projects }),
}));
vi.mock("@/hooks/queries/task/use-get-assigned-tasks", () => ({
  default: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/use-local-day", () => ({
  useLocalDay: () => "2026-10-16",
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: () => m.canCreateTasks,
    canCreateProjects: () => m.canCreateProjects,
  }),
}));

const Home = (Route as unknown as { options: { component: ComponentType } })
  .options.component;

beforeEach(() => {
  m.projects = [{ id: "project-1" }];
  m.canCreateTasks = true;
  m.canCreateProjects = true;
});

afterEach(cleanup);

describe("workspace home", () => {
  it.each([
    ["task", "newTask"],
    ["feature", "newFeature"],
    ["bug", "newBug"],
  ])("opens the %s create dialog from one New menu", async (type, item) => {
    render(<Home />);

    const triggers = screen.getAllByRole("button", {
      name: "tasks:createMenu.label",
    });
    expect(triggers).toHaveLength(1);
    fireEvent.click(triggers[0]);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: `tasks:createMenu.${item}` }),
    );

    expect(
      screen.getByRole("dialog", { name: `create-${type}` }),
    ).toBeInTheDocument();
  });

  it.each(["newTask", "newFeature", "newBug"])(
    "asks for a project first when selecting %s in an empty workspace",
    async (item) => {
      m.projects = [];
      render(<Home />);

      fireEvent.click(
        screen.getByRole("button", { name: "tasks:createMenu.label" }),
      );
      fireEvent.click(
        await screen.findByRole("menuitem", {
          name: `tasks:createMenu.${item}`,
        }),
      );

      expect(
        screen.getByRole("dialog", { name: "create-project" }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    },
  );

  it("offers no creation menu without permission to create tasks", () => {
    m.canCreateTasks = false;
    render(<Home />);

    expect(
      screen.queryByRole("button", { name: "tasks:createMenu.label" }),
    ).toBeNull();
  });
});
