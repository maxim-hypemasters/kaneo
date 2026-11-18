import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { Team } from "@/fetchers/team/types";
import { ProjectTeamsCard } from "./project-teams-card";

const { setLink } = vi.hoisted(() => ({ setLink: vi.fn(async () => ({})) }));
let canUpdate = true;
let teams: Team[] = [];

function team(id: string, name: string, projectIds: string[]): Team {
  return {
    id,
    name,
    workspaceId: "w1",
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
    members: [],
    projects: projectIds.map((projectId) => ({
      id: projectId,
      name: projectId,
      slug: projectId,
      icon: null,
    })),
  };
}

vi.mock("@/hooks/queries/team/use-get-teams", () => ({
  useGetTeams: () => ({ data: teams, isPending: false }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTeams: () => canUpdate,
    isCheckingPermissions: false,
  }),
}));
vi.mock("@/hooks/mutations/team/use-set-team-project-link", () => ({
  useSetTeamProjectLink: () => ({ mutateAsync: setLink, isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

beforeEach(() => {
  canUpdate = true;
  teams = [
    team("t1", "Design", ["p1"]),
    team("t2", "Platform", ["p1"]),
    team("t3", "Support", []),
  ];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("project teams card", () => {
  it("lists linked teams top to bottom with Link team last", () => {
    render(<ProjectTeamsCard projectId="p1" workspaceId="w1" />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Design"),
      expect.stringContaining("Platform"),
    ]);
    const buttons = screen.getAllByRole("button");
    expect(buttons.at(-1)?.textContent).toContain(
      "teams:projectTeams.linkTeam",
    );
  });

  it("unlinks a team from its row", () => {
    render(<ProjectTeamsCard projectId="p1" workspaceId="w1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "teams:projectTeams.unlink:Design" }),
    );
    expect(setLink).toHaveBeenCalledWith({
      teamId: "t1",
      projectId: "p1",
      linked: false,
    });
  });

  it("links a team that isn't linked yet", async () => {
    render(<ProjectTeamsCard projectId="p1" workspaceId="w1" />);
    fireEvent.click(
      screen.getByRole("button", { name: /teams:projectTeams.linkTeam/ }),
    );
    expect(screen.queryByRole("option", { name: /Design/ })).toBeNull();
    fireEvent.click(await screen.findByRole("option", { name: /Support/ }));
    expect(setLink).toHaveBeenCalledWith({
      teamId: "t3",
      projectId: "p1",
      linked: true,
    });
  });

  it("is read-only without team:update", () => {
    canUpdate = false;
    render(<ProjectTeamsCard projectId="p1" workspaceId="w1" />);
    expect(screen.getByText("Design")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when no team is linked", () => {
    canUpdate = false;
    render(<ProjectTeamsCard projectId="p9" workspaceId="w1" />);
    expect(screen.getByText("teams:projectTeams.none")).toBeTruthy();
  });
});
