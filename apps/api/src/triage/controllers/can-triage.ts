import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { hasWorkspacePermission } from "../../utils/require-workspace-permission";
import { getTriageMemberIds } from "../read-triage-members";

// Triage members decide. With nobody on the list, project:update holders can
// still clear work that was waiting when the list was emptied.
export async function canTriage(c: Context, projectId: string) {
  const memberIds = await getTriageMemberIds(projectId);
  if (memberIds.includes(c.get("userId"))) return true;
  return (
    memberIds.length === 0 &&
    (await hasWorkspacePermission(c, { project: ["update"] }))
  );
}

export async function requireTriageAccess(c: Context, next: Next) {
  const projectId = c.get("authorizedProjectId") as string | undefined;
  if (!projectId || !(await canTriage(c, projectId)))
    throw new HTTPException(403, {
      message: "Only this project's triage members can accept or decline work",
    });
  return next();
}
