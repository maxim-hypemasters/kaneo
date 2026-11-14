import { describe, expect, it } from "vite-plus/test";
import { mirrorTaskPermissions } from "./mirror-task-permissions";

describe("mirrorTaskPermissions", () => {
  it("copies task CRUD actions to bugs, features and milestones", () => {
    const next = mirrorTaskPermissions(
      JSON.stringify({
        task: ["create", "read", "update", "assign"],
        label: ["read"],
      }),
    );
    expect(JSON.parse(next ?? "null")).toEqual({
      task: ["create", "read", "update", "assign"],
      label: ["read"],
      bug: ["create", "read", "update"],
      feature: ["create", "read", "update"],
      milestone: ["create", "read", "update"],
    });
  });

  it("keeps resources that are already set", () => {
    const next = mirrorTaskPermissions(
      JSON.stringify({ task: ["read", "delete"], bug: [] }),
    );
    expect(JSON.parse(next ?? "null")).toEqual({
      task: ["read", "delete"],
      bug: [],
      feature: ["read", "delete"],
      milestone: ["read", "delete"],
    });
  });

  it("leaves sets without task access or with nothing missing alone", () => {
    expect(mirrorTaskPermissions(JSON.stringify({ label: ["read"] }))).toBe(
      null,
    );
    expect(mirrorTaskPermissions(JSON.stringify({ task: ["assign"] }))).toBe(
      null,
    );
    expect(
      mirrorTaskPermissions(
        JSON.stringify({
          task: ["read"],
          bug: ["read"],
          feature: ["read"],
          milestone: ["read"],
        }),
      ),
    ).toBe(null);
  });

  it("skips unreadable or malformed sets", () => {
    expect(mirrorTaskPermissions("not json")).toBe(null);
    expect(mirrorTaskPermissions("[]")).toBe(null);
    expect(mirrorTaskPermissions(JSON.stringify({ task: "read" }))).toBe(null);
  });
});
