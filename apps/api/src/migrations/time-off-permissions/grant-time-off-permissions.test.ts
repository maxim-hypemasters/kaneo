import { describe, expect, it } from "vite-plus/test";
import { grantTimeOffPermissions } from "./grant-time-off-permissions";

const grant = (permissions: unknown) =>
  JSON.parse(grantTimeOffPermissions(JSON.stringify(permissions)) ?? "null");

describe("grantTimeOffPermissions", () => {
  it("gives the default roles their new time-off defaults", () => {
    expect(grant({ task: ["read"], workspace: ["read"] })).toEqual({
      task: ["read"],
      workspace: ["read"],
      time_off: ["read"],
    });
    expect(
      grant({ task: ["create", "read", "update"], workspace: ["read"] }),
    ).toMatchObject({ time_off: ["create", "read"] });
    expect(
      grant({
        task: ["create", "read", "update", "delete", "assign"],
        workspace: ["read", "update", "manage_settings"],
        member: ["create", "update", "delete"],
      }),
    ).toMatchObject({ time_off: ["create", "read", "approve"] });
  });

  it("grants create from update on any work item type", () => {
    for (const resource of ["task", "bug", "feature"]) {
      expect(grant({ [resource]: ["update"] })).toEqual({
        [resource]: ["update"],
        time_off: ["create"],
      });
    }
  });

  it("grants approve from member:update alone", () => {
    expect(grant({ member: ["update"] })).toEqual({
      member: ["update"],
      time_off: ["approve"],
    });
    expect(grant({ member: ["delete"], workspace: ["read"] })).toMatchObject({
      time_off: ["read"],
    });
  });

  it("keeps sets that already decide time off", () => {
    expect(
      grantTimeOffPermissions(
        JSON.stringify({ workspace: ["read"], time_off: [] }),
      ),
    ).toBeNull();
    expect(
      grantTimeOffPermissions(
        JSON.stringify({ member: ["update"], time_off: ["read"] }),
      ),
    ).toBeNull();
  });

  it("skips sets that imply no time-off access", () => {
    expect(
      grantTimeOffPermissions(
        JSON.stringify({ task: ["read"], member: ["delete"] }),
      ),
    ).toBeNull();
    expect(grantTimeOffPermissions("{}")).toBeNull();
  });

  it("skips unreadable or malformed sets", () => {
    expect(grantTimeOffPermissions("not json")).toBeNull();
    expect(grantTimeOffPermissions("[]")).toBeNull();
    expect(grantTimeOffPermissions("null")).toBeNull();
    expect(
      grantTimeOffPermissions(JSON.stringify({ workspace: "read" })),
    ).toBeNull();
  });
});
