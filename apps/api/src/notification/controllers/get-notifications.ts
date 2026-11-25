import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import db from "../../database";
import {
  notificationTable,
  projectTable,
  taskTable,
  workspaceTable,
} from "../../database/schema";

import { documentResourceProjectId } from "../document-resource";
import { notificationResourceAccess } from "../resource-access";
import { notificationWorkspaceFilter } from "../workspace-filter";

// `hiddenTypes` are left out before the limit, such as the time off types a
// scoped API key may not read.
async function getNotifications(
  userId: string,
  workspaceId?: string,
  hiddenTypes: readonly string[] = [],
) {
  const rows = await db
    .select({
      notification: notificationTable,
      taskType: taskTable.type,
      projectId: projectTable.id,
      workspaceId: workspaceTable.id,
    })
    .from(notificationTable)
    .leftJoin(
      taskTable,
      and(
        eq(notificationTable.resourceId, taskTable.id),
        eq(notificationTable.resourceType, "task"),
      ),
    )
    // A task's project, or the project of the page or Feature document a
    // comment notification points at.
    .leftJoin(
      projectTable,
      eq(
        projectTable.id,
        sql`coalesce(${taskTable.projectId}, ${documentResourceProjectId(
          notificationTable.resourceId,
          notificationTable.resourceType,
        )})`,
      ),
    )
    .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(
      and(
        eq(notificationTable.userId, userId),
        notificationWorkspaceFilter(workspaceId),
        hiddenTypes.length > 0
          ? notInArray(notificationTable.type, [...hiddenTypes])
          : undefined,
        notificationResourceAccess(
          userId,
          notificationTable.resourceId,
          notificationTable.resourceType,
        ),
      ),
    )
    .orderBy(desc(notificationTable.createdAt))
    .limit(50);

  return rows.map(({ notification, taskType, projectId, workspaceId }) => {
    if (!projectId && !workspaceId) {
      return { ...notification, taskType };
    }

    const existing =
      notification.eventData &&
      typeof notification.eventData === "object" &&
      !Array.isArray(notification.eventData)
        ? (notification.eventData as Record<string, unknown>)
        : {};

    return {
      ...notification,
      taskType,
      eventData: {
        ...existing,
        projectId: projectId ?? existing.projectId ?? null,
        workspaceId: workspaceId ?? existing.workspaceId ?? null,
      },
    };
  });
}

export default getNotifications;
