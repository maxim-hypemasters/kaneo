import { describe, expect, it } from "vite-plus/test";
import { grantTestCasePermissions } from "./grant-test-case-permissions";

const grant = (permissions: unknown) =>
  JSON.parse(grantTestCasePermissions(JSON.stringify(permissions)) ?? "null");

describe("grantTestCasePermissions", () => {
  it("copies each role's milestone actions", () => {
    expect(grant({ milestone: ["read"] })).toEqual({
      milestone: ["read"],
      test_case: ["read"],
    });
    expect(grant({ milestone: ["create", "read", "update"] })).toMatchObject({
      test_case: ["create", "read", "update"],
    });
    expect(
      grant({ milestone: ["create", "read", "update", "delete"] }),
    ).toMatchObject({ test_case: ["create", "read", "update", "delete"] });
  });

  it("ignores actions test cases don't have", () => {
    expect(grant({ milestone: ["read", "assign"] })).toMatchObject({
      test_case: ["read"],
    });
  });

  it("keeps sets that already decide test cases", () => {
    expect(
      grantTestCasePermissions(
        JSON.stringify({ milestone: ["read"], test_case: [] }),
      ),
    ).toBeNull();
  });

  it("leaves sets without milestone access alone", () => {
    expect(grantTestCasePermissions(JSON.stringify({ task: ["read"] }))).toBe(
      null,
    );
    expect(
      grantTestCasePermissions(JSON.stringify({ milestone: [] })),
    ).toBeNull();
  });

  it("skips unreadable sets", () => {
    expect(grantTestCasePermissions("not json")).toBeNull();
    expect(grantTestCasePermissions("[]")).toBeNull();
    expect(grantTestCasePermissions("null")).toBeNull();
  });
});
