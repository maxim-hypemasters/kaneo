import { describe, expect, it } from "vite-plus/test";
import { teamProjectCandidates } from "./team-project-candidates";

describe("teamProjectCandidates", () => {
  it("leaves out linked projects and sorts the rest by name", () => {
    const projects = [
      { id: "p3", name: "Website" },
      { id: "p1", name: "API" },
      { id: "p2", name: "Mobile" },
    ];

    expect(teamProjectCandidates(projects, ["p2"])).toEqual([
      { id: "p1", name: "API" },
      { id: "p3", name: "Website" },
    ]);
  });
});
