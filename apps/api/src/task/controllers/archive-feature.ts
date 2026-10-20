import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { activityTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { lockAuthorizedProject } from "../../milestone/access-scope";

export async function archiveFeature(
  id: string,
  archived: boolean,
  userId: string,
  projectId: string | undefined,
  workspaceId: string,
) {
  const result = await db.transaction(async (tx) => {
    await lockAuthorizedProject(tx, projectId, workspaceId);
    const [feature] = await tx
      .select()
      .from(taskTable)
      .where(eq(taskTable.id, id))
      .for("update");
    if (!feature)
      throw new HTTPException(404, { message: "Feature not found" });
    if (feature.projectId !== projectId)
      throw new HTTPException(409, {
        message: "Feature changed projects; retry",
      });
    if (feature.type !== "feature")
      throw new HTTPException(400, {
        message: "Only Features support this archive operation",
      });
    if (Boolean(feature.archivedAt) === archived) return feature;
    const [updated] = await tx
      .update(taskTable)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(taskTable.id, id))
      .returning();
    await tx.insert(activityTable).values({
      taskId: id,
      type: archived ? "feature_archived" : "feature_unarchived",
      userId,
      content: null,
    });
    return updated!;
  });
  await publishEvent("task.updated", {
    taskId: id,
    projectId: result.projectId,
    userId,
  });
  return result;
}
