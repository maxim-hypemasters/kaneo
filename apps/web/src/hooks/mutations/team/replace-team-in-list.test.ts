import { describe, expect, it } from "vite-plus/test";
import type { Team } from "@/fetchers/team/types";
import { replaceTeamInList } from "./replace-team-in-list";

function team(id: string, name: string): Team {
  return {
    id,
    name,
    workspaceId: "ws",
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
    members: [],
    projects: [],
  };
}

describe("replaceTeamInList", () => {
  it("replaces the saved team and keeps the others in place", () => {
    const list = [team("a", "Design"), team("b", "Platform")];
    expect(replaceTeamInList(list, team("b", "Infra"))).toEqual([
      team("a", "Design"),
      team("b", "Infra"),
    ]);
  });

  it("leaves an unloaded list alone", () => {
    expect(replaceTeamInList(undefined, team("a", "Design"))).toBeUndefined();
  });
});
