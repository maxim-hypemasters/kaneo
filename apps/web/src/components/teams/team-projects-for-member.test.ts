import { describe, expect, it } from "vite-plus/test";
import type { Team } from "@/fetchers/team/types";
import { teamProjectsForMember } from "./team-projects-for-member";

function team(
  name: string,
  memberIds: string[],
  projects: { id: string; name: string }[],
): Team {
  return {
    id: name,
    name,
    workspaceId: "ws",
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
    members: memberIds.map((id) => ({
      id,
      name: id,
      email: `${id}@x.test`,
      image: null,
    })),
    projects: projects.map((project) => ({
      ...project,
      slug: project.id,
      icon: null,
    })),
  };
}

describe("teamProjectsForMember", () => {
  it("collects each project once with every team that grants it", () => {
    const web = { id: "p1", name: "Website" };
    const api = { id: "p2", name: "API" };
    const teams = [
      team("Design", ["u1"], [web]),
      team("Platform", ["u1", "u2"], [api, web]),
      team("Support", ["u2"], [{ id: "p3", name: "Help desk" }]),
    ];

    expect(
      teamProjectsForMember(teams, "u1").map((entry) => [
        entry.project.name,
        entry.teamNames,
      ]),
    ).toEqual([
      ["API", ["Platform"]],
      ["Website", ["Design", "Platform"]],
    ]);
  });

  it("returns nothing for someone outside every team", () => {
    expect(teamProjectsForMember([team("Design", ["u1"], [])], "u9")).toEqual(
      [],
    );
  });
});
