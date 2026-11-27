import { describe, expect, it } from "vite-plus/test";
import { parseRecommendations } from "./parse-recommendations";

describe("parseRecommendations", () => {
  it("keeps the keys that validate and drops the rest", () => {
    expect(
      parseRecommendations({
        assignee: { userId: "u1", reason: "Owns login" },
        priority: { priority: "no-priority", reason: "Not a pick" },
        estimate: { minutes: 90.5, reason: "Not whole minutes" },
        release: "r1",
        testCases: { cases: [] },
        mood: { reason: "Unknown key" },
      }),
    ).toEqual({ assignee: { userId: "u1", reason: "Owns login" } });
  });

  it("shortens a long reason instead of dropping the pick", () => {
    const parsed = parseRecommendations({
      estimate: { minutes: 120, reason: `  ${"x".repeat(250)}` },
    });
    expect(parsed.estimate?.reason).toHaveLength(200);
  });

  it("accepts a null milestone and missing test case details", () => {
    expect(
      parseRecommendations({
        feature: { featureId: "f1", milestoneId: null, reason: "Login" },
        testCases: { cases: [{ title: "Signs in", steps: null }] },
      }),
    ).toEqual({
      feature: { featureId: "f1", milestoneId: null, reason: "Login" },
      testCases: { cases: [{ title: "Signs in", steps: null }] },
    });
  });

  it.each([undefined, null, "none", ["assignee"]])(
    "reads %j as no recommendations",
    (raw) => {
      expect(parseRecommendations(raw)).toEqual({});
    },
  );
});
