import { describe, expect, it } from "vite-plus/test";
import { switchBranchPattern } from "./switch-branch-pattern";

const switched = (config: unknown) =>
  JSON.parse(switchBranchPattern(JSON.stringify(config)) ?? "null");

describe("switchBranchPattern", () => {
  it("switches the old default and keeps every other key", () => {
    expect(
      switched({
        repositoryOwner: "acme",
        branchPattern: "{slug}-{number}",
        statusTransitions: { onBranchPush: "in-progress" },
      }),
    ).toEqual({
      repositoryOwner: "acme",
      branchPattern: "{type}/{slug}-{number}/{title}",
      statusTransitions: { onBranchPush: "in-progress" },
    });
  });

  it("keeps a pattern someone chose", () => {
    expect(switched({ branchPattern: "{slug}-{number}-{title}" })).toBeNull();
    expect(switched({ branchPattern: "feature/{slug}-{number}" })).toBeNull();
    expect(
      switched({ branchPattern: "{type}/{slug}-{number}/{title}" }),
    ).toBeNull();
  });

  it("keeps a custom regex", () => {
    expect(
      switched({
        branchPattern: "{slug}-{number}",
        customBranchRegex: "TASK-(\\d+)",
      }),
    ).toBeNull();
  });

  it("leaves a config without a pattern, which reads as the new default", () => {
    expect(switched({ repositoryOwner: "acme" })).toBeNull();
  });

  it("skips unreadable configs", () => {
    expect(switchBranchPattern("not json")).toBeNull();
    expect(switchBranchPattern("[]")).toBeNull();
    expect(switchBranchPattern("null")).toBeNull();
  });
});
