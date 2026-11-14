import { describe, expect, it } from "vite-plus/test";
import { grantProjectDocumentPermissions } from "./grant-project-document-permissions";

const grant = (permissions: unknown) =>
  JSON.parse(
    grantProjectDocumentPermissions(JSON.stringify(permissions)) ?? "null",
  );

describe("grantProjectDocumentPermissions", () => {
  it("gives a member the page access task permissions used to give", () => {
    expect(
      grant({
        project: ["create", "read"],
        task: ["create", "read", "update"],
        label: ["read"],
      }),
    ).toEqual({
      project: ["create", "read"],
      task: ["create", "read", "update"],
      label: ["read"],
      document: ["create", "read", "update"],
    });
  });

  it("gives viewers read access and admins everything, including project details", () => {
    expect(grant({ project: ["read"], task: ["read"] })).toEqual({
      project: ["read"],
      task: ["read"],
      document: ["read"],
    });
    expect(
      grant({
        project: ["create", "read", "update", "delete", "share"],
        task: ["create", "read", "update", "delete", "assign"],
      }),
    ).toMatchObject({
      project: ["create", "read", "update", "delete", "share", "edit_details"],
      document: ["create", "read", "update", "delete"],
    });
  });

  it("keeps sets that already decide these permissions", () => {
    expect(
      grantProjectDocumentPermissions(
        JSON.stringify({
          project: ["update", "edit_details"],
          task: ["read"],
          document: [],
        }),
      ),
    ).toBeNull();
    expect(
      grantProjectDocumentPermissions(JSON.stringify({ task: ["assign"] })),
    ).toBeNull();
  });

  it("skips unreadable or malformed sets", () => {
    expect(grantProjectDocumentPermissions("not json")).toBeNull();
    expect(grantProjectDocumentPermissions("[]")).toBeNull();
    expect(
      grantProjectDocumentPermissions(JSON.stringify({ task: "read" })),
    ).toBeNull();
  });
});
