import { and, eq, inArray, notInArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectTable,
  projectTriageMemberTable,
  workspaceUserTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { filterUsersWithProjectAccess } from "../../project-access/filter-users-with-project-access";
import { retryTransaction } from "../../utils/retry-transaction";
import { getTriageMemberIds } from "../read-triage-members";

export default async function replaceTriageMembers({
  projectId,
  userIds,
  currentUserId,
}: {
  projectId: string;
  userIds: string[];
  currentUserId: string;
}) {
  const ids = [...new Set(userIds)];
  const result = await retryTransaction(() =>
    db.transaction(async (tx) => {
      const [project] = await tx
        .select({ workspaceId: projectTable.workspaceId })
        .from(projectTable)
        .where(eq(projectTable.id, projectId))
        .for("update");
      if (!project)
        throw new HTTPException(404, { message: "Project not found" });
      const members = ids.length
        ? await tx
            .select({ userId: workspaceUserTable.userId })
            .from(workspaceUserTable)
            .where(
              and(
                eq(workspaceUserTable.workspaceId, project.workspaceId),
                inArray(workspaceUserTable.userId, ids),
              ),
            )
        : [];
      const permitted = await filterUsersWithProjectAccess(
        members.map((member) => member.userId),
        projectId,
        tx,
      );
      if (ids.some((id) => !permitted.has(id)))
        throw new HTTPException(400, {
          message:
            "Triage members must be workspace members with access to this project",
        });
      // Kept rows keep their position; the list reads in the order added.
      await tx
        .delete(projectTriageMemberTable)
        .where(
          and(
            eq(projectTriageMemberTable.projectId, projectId),
            ids.length
              ? notInArray(projectTriageMemberTable.userId, ids)
              : undefined,
          ),
        );
      if (ids.length)
        await tx
          .insert(projectTriageMemberTable)
          .values(
            ids.map((userId) => ({
              workspaceId: project.workspaceId,
              projectId,
              userId,
            })),
          )
          .onConflictDoNothing();
      return { userIds: await getTriageMemberIds(projectId, tx) };
    }),
  );
  await publishEvent("project.triage_members_updated", {
    projectId,
    userId: currentUserId,
  });
  return result;
}
