import { describe, expect, it } from "vite-plus/test";
import { describeReleaseChanges } from "./describe-release-changes.js";
import { releaseFixture } from "./test-releases.js";

const before = releaseFixture("r1", "2.4", { description: "Payments" });
const today = "2026-10-07";

describe("describeReleaseChanges", () => {
  it("lists a rename, moved dates and the description", () => {
    expect(
      describeReleaseChanges(
        before,
        {
          name: "2.4.1",
          codeFreezeDate: "2026-10-22",
          submissionDate: "2027-01-05",
          description: null,
        },
        today,
      ),
    ).toEqual([
      "renamed from 2.4",
      "code freeze Oct 22",
      "submission Jan 5, 2027",
      "description cleared",
    ]);
  });

  it("leaves out values that stay the same", () => {
    expect(
      describeReleaseChanges(
        before,
        { name: "2.4", startDate: "2026-10-01", description: "Payments" },
        today,
      ),
    ).toEqual(["no changes"]);
  });

  it("says when the description changed", () => {
    expect(
      describeReleaseChanges(before, { description: "Refunds" }, today),
    ).toEqual(["description updated"]);
  });
});
