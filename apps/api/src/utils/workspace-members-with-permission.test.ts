import { describe, expect, it, vi } from "vite-plus/test";
import * as tables from "../database/schema";
import { workspaceMembersWithPermission } from "./workspace-members-with-permission";

vi.mock("../database", async () => ({
  default: {},
  schema: await import("../database/schema"),
}));

// Membership rows in the order the query sorts them (joinedAt, then id).
type Member = { userId: string; role: string; userRole?: string | null };
type StoredRole = { role: string; permission: string | null };

function fakeDatabase(members: Member[], storedRoles: StoredRole[] = []) {
  const queried: unknown[] = [];
  const memberRows = members.map((member) => ({
    userRole: null,
    ...member,
  }));
  const database = {
    select: () => ({
      from: (table: unknown) => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: async () => {
              queried.push(table);
              if (table === tables.workspaceUserTable) return memberRows;
              throw new Error("unexpected table");
            },
          }),
        }),
        where: async () => {
          queried.push(table);
          if (table === tables.workspaceRoleTable) return storedRoles;
          throw new Error("unexpected table");
        },
      }),
    }),
  };
  return {
    database: database as unknown as Parameters<
      typeof workspaceMembersWithPermission
    >[2],
    queried,
  };
}

const approve = { time_off: ["approve"] };

describe("workspaceMembersWithPermission", () => {
  it("uses the built-in roles when a workspace has no stored rows", async () => {
    const { database } = fakeDatabase([
      { userId: "owner", role: "owner" },
      { userId: "admin", role: "admin" },
      { userId: "member", role: "member" },
      { userId: "viewer", role: "viewer" },
    ]);

    await expect(
      workspaceMembersWithPermission("ws", approve, database),
    ).resolves.toEqual(["owner", "admin"]);
  });

  it("follows stored and custom roles over the built-in defaults", async () => {
    const { database } = fakeDatabase(
      [
        { userId: "owner", role: "owner" },
        { userId: "admin", role: "admin" },
        { userId: "member", role: "member" },
        { userId: "lead", role: "team-lead" },
        { userId: "guest", role: "guest" },
      ],
      [
        { role: "admin", permission: JSON.stringify({ time_off: ["read"] }) },
        { role: "member", permission: JSON.stringify(approve) },
        {
          role: "team-lead",
          permission: JSON.stringify({ time_off: ["create", "approve"] }),
        },
        { role: "guest", permission: JSON.stringify({ time_off: [] }) },
      ],
    );

    await expect(
      workspaceMembersWithPermission("ws", approve, database),
    ).resolves.toEqual(["owner", "member", "lead"]);
  });

  it("allows a member when any of their roles grants the permissions", async () => {
    const { database } = fakeDatabase(
      [{ userId: "multi", role: "viewer, team-lead" }],
      [{ role: "team-lead", permission: JSON.stringify(approve) }],
    );

    await expect(
      workspaceMembersWithPermission("ws", approve, database),
    ).resolves.toEqual(["multi"]);
  });

  it("returns each user once, even with duplicate membership rows", async () => {
    const { database } = fakeDatabase([
      { userId: "dup", role: "admin" },
      { userId: "dup", role: "owner" },
      { userId: "dup", role: "member" },
    ]);

    await expect(
      workspaceMembersWithPermission("ws", approve, database),
    ).resolves.toEqual(["dup"]);
  });

  it("judges a user with duplicate rows by their first row, like the route checks", async () => {
    const { database } = fakeDatabase([
      { userId: "viewer-first", role: "viewer" },
      { userId: "admin-first", role: "admin" },
      { userId: "viewer-first", role: "admin" },
      { userId: "admin-first", role: "viewer" },
    ]);

    await expect(
      workspaceMembersWithPermission("ws", approve, database),
    ).resolves.toEqual(["admin-first"]);
  });

  it("counts instance admins who are members, whatever their workspace role", async () => {
    const { database } = fakeDatabase([
      { userId: "instance-admin", role: "viewer", userRole: "user,admin" },
      { userId: "plain", role: "viewer", userRole: "user" },
    ]);

    await expect(
      workspaceMembersWithPermission("ws", approve, database),
    ).resolves.toEqual(["instance-admin"]);
  });

  it("skips the role lookup when the workspace has no members", async () => {
    const { database, queried } = fakeDatabase([]);

    await expect(
      workspaceMembersWithPermission("ws", approve, database),
    ).resolves.toEqual([]);
    expect(queried).toEqual([tables.workspaceUserTable]);
  });
});
