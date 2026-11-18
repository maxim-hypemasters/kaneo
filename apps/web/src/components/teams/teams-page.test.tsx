import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { Team } from "@/fetchers/team/types";
import { TeamsPage } from "./teams-page";

const { replaceMembers, replaceProjects } = vi.hoisted(() => ({
  replaceMembers: vi.fn(async () => ({})),
  replaceProjects: vi.fn(async () => ({})),
}));
let teams: Team[] = [];
let permissions = { create: true, update: true, remove: true };

vi.mock("@/components/common/workspace-layout", () => ({
  default: ({
    headerActions,
    children,
  }: {
    headerActions?: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      {headerActions}
      {children}
    </div>
  ),
}));
vi.mock("@/hooks/queries/team/use-get-teams", () => ({
  useGetTeams: () => ({ data: teams, isError: false, refetch: vi.fn() }),
}));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({
      data: {
        members: [
          { userId: "u1", user: { name: "Ada", email: "ada@example.com" } },
          { userId: "u2", user: { name: "Grace", email: "grace@example.com" } },
        ],
      },
      isPending: false,
    }),
  }),
);
vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({
    data: [
      { id: "p1", name: "Website", icon: "Layout" },
      { id: "p2", name: "API", icon: "Layout" },
    ],
    isPending: false,
  }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTeams: () => permissions.create,
    canUpdateTeams: () => permissions.update,
    canDeleteTeams: () => permissions.remove,
    isCheckingPermissions: false,
  }),
}));
vi.mock("@/hooks/mutations/team/use-replace-team-members", () => ({
  useReplaceTeamMembers: () => ({
    mutateAsync: replaceMembers,
    isPending: false,
  }),
}));
vi.mock("@/hooks/mutations/team/use-replace-team-projects", () => ({
  useReplaceTeamProjects: () => ({
    mutateAsync: replaceProjects,
    isPending: false,
  }),
}));
vi.mock("./team-name-dialog", () => ({ TeamNameDialog: () => null }));
vi.mock("./delete-team-dialog", () => ({ DeleteTeamDialog: () => null }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

function design(): Team {
  return {
    id: "t1",
    name: "Design",
    workspaceId: "w1",
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
    members: [{ id: "u1", name: "Ada", email: "ada@example.com", image: null }],
    projects: [{ id: "p1", name: "Website", slug: "web", icon: "Layout" }],
  };
}

beforeEach(() => {
  teams = [design()];
  permissions = { create: true, update: true, remove: true };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("teams page", () => {
  it("lists each team's members and projects", () => {
    render(<TeamsPage workspaceId="w1" />);
    expect(screen.getByText("Design")).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("Website")).toBeTruthy();
  });

  it("saves the member list without the one removed", () => {
    render(<TeamsPage workspaceId="w1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "teams:card.removeMember:Ada" }),
    );
    expect(replaceMembers).toHaveBeenCalledWith({ id: "t1", userIds: [] });
  });

  it("saves the project list without the one unlinked", () => {
    render(<TeamsPage workspaceId="w1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "teams:card.unlinkProject:Website" }),
    );
    expect(replaceProjects).toHaveBeenCalledWith({ id: "t1", projectIds: [] });
  });

  it("is read-only without team permissions", () => {
    permissions = { create: false, update: false, remove: false };
    render(<TeamsPage workspaceId="w1" />);
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers to create the first team", () => {
    teams = [];
    render(<TeamsPage workspaceId="w1" />);
    expect(screen.getByText("teams:page.emptyTitle")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "teams:page.newTeam" }),
    ).toHaveLength(2);
  });
});
