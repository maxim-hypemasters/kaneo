import { eq } from "drizzle-orm";
import db, { schema } from "../database";
import { hasInstanceAdminRole } from "./instance-admin-role";
import { storedRolePermissions } from "./require-workspace-permission";
import { type PermissionMap, rolesAllow } from "./role-permissions";
import { splitRoles } from "./split-roles";

// User ids of current workspace members whose roles allow `permissions`, such
// as the approvers to notify. Follows `requireWorkspacePermission`: instance
// admins pass, and a user with duplicate membership rows is judged by their
// first row (joinedAt, then id). Instance admins who are not members are left
// out: workspace notifications follow membership.
export async function workspaceMembersWithPermission(
  workspaceId: string,
  permissions: PermissionMap,
  database: Pick<typeof db, "select"> = db,
): Promise<string[]> {
  const rows = await database
    .select({
      userId: schema.workspaceUserTable.userId,
      role: schema.workspaceUserTable.role,
      userRole: schema.userTable.role,
    })
    .from(schema.workspaceUserTable)
    .innerJoin(
      schema.userTable,
      eq(schema.userTable.id, schema.workspaceUserTable.userId),
    )
    .where(eq(schema.workspaceUserTable.workspaceId, workspaceId))
    .orderBy(schema.workspaceUserTable.joinedAt, schema.workspaceUserTable.id);

  const members = new Map<string, (typeof rows)[number]>();
  for (const row of rows)
    if (!members.has(row.userId)) members.set(row.userId, row);

  const roleNames = [
    ...new Set(
      [...members.values()].flatMap((member) => splitRoles(member.role)),
    ),
  ];
  const stored = await storedRolePermissions(workspaceId, roleNames, database);

  return [...members.values()]
    .filter(
      (member) =>
        hasInstanceAdminRole(member.userRole) ||
        rolesAllow(splitRoles(member.role), stored, permissions),
    )
    .map((member) => member.userId);
}
