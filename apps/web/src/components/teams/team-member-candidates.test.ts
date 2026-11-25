import { describe, expect, it } from "vite-plus/test";
import { teamMemberCandidates } from "./team-member-candidates";

describe("teamMemberCandidates", () => {
  it("lists workspace members outside the team once, by name", () => {
    const members = [
      { userId: "u3", user: { name: "Zoe", email: "zoe@x.test", image: null } },
      { userId: "u1", user: { name: "Ann", email: "ann@x.test", image: null } },
      {
        userId: "u2",
        user: { name: "Bob", email: "bob@x.test", image: "b.png" },
      },
      {
        userId: "u2",
        user: { name: "Bob", email: "bob@x.test", image: "b.png" },
      },
    ];

    expect(teamMemberCandidates(members, ["u1"])).toEqual([
      { id: "u2", name: "Bob", email: "bob@x.test", image: "b.png" },
      { id: "u3", name: "Zoe", email: "zoe@x.test", image: null },
    ]);
  });

  it("falls back to the email when a member has no name", () => {
    expect(
      teamMemberCandidates([{ userId: "u1", user: { email: "a@x.test" } }], []),
    ).toEqual([{ id: "u1", name: null, email: "a@x.test", image: null }]);
  });
});
