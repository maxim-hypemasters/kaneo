import { describe, expect, it } from "vite-plus/test";
import type { Team } from "@/fetchers/team/types";
import { teamsLinkedToProject } from "./teams-linked-to-project";

function team(name: string, projectIds: string[]): Team {
  return {
    id: name,
    name,
    workspaceId: "ws",
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
    members: [],
    projects: projectIds.map((id) => ({ id, name: id, slug: id, icon: null })),
  };
}

describe("teamsLinkedToProject", () => {
  it("keeps the teams linked to the project, in list order", () => {
    const teams = [
      team("Design", ["p1"]),
      team("Platform", ["p2"]),
      team("Support", ["p2", "p1"]),
    ];
    expect(teamsLinkedToProject(teams, "p1").map((t) => t.name)).toEqual([
      "Design",
      "Support",
    ]);
  });
});
