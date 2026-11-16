import { eq } from "drizzle-orm";
import db from "../database";
import { projectTable, userTable } from "../database/schema";
import { subscribeToEvent } from "../events";
import { getTriageMemberIds } from "../triage/read-triage-members";
import { TRIAGE_STATUS } from "../triage/triage-status";
import createNotification from "./controllers/create-notification";

async function projectWorkspaceId(projectId: string) {
  const [project] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);
  return project?.workspaceId ?? null;
}

async function userName(userId: string | null | undefined) {
  if (!userId) return null;
  const [user] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return user?.name ?? null;
}

// New work waiting in Triage goes to every triage member but its reporter.
subscribeToEvent<{
  taskId: string;
  projectId: string;
  title: string;
  status?: string | null;
  currentUserId?: string;
}>("task.created", async (data) => {
  if (data.status !== TRIAGE_STATUS) return;
  const recipients = (await getTriageMemberIds(data.projectId)).filter(
    (userId) => userId !== data.currentUserId,
  );
  if (!recipients.length) return;
  const eventData = {
    taskTitle: data.title,
    reporterName: await userName(data.currentUserId),
    projectId: data.projectId,
    workspaceId: await projectWorkspaceId(data.projectId),
  };
  for (const userId of recipients)
    await createNotification({
      userId,
      type: "task_triage_new",
      eventData,
      resourceId: data.taskId,
      resourceType: "task",
    });
});

// The reporter hears whether their work was accepted or declined.
subscribeToEvent<{
  taskId: string;
  projectId: string;
  title: string;
  createdBy: string | null;
  userId: string;
  outcome: "accepted" | "declined";
  reason: string | null;
}>("task.triage_resolved", async (data) => {
  if (!data.createdBy || data.createdBy === data.userId) return;
  await createNotification({
    userId: data.createdBy,
    type: `task_triage_${data.outcome}`,
    eventData: {
      taskTitle: data.title,
      actorName: await userName(data.userId),
      ...(data.reason ? { reason: data.reason.slice(0, 500) } : {}),
      projectId: data.projectId,
      workspaceId: await projectWorkspaceId(data.projectId),
    },
    resourceId: data.taskId,
    resourceType: "task",
  });
});
