import { eq } from "drizzle-orm";
import db from "../../database";
import { userTable } from "../../database/schema";
import createNotification from "../../notification/controllers/create-notification";
import { newMentionIds } from "../../utils/new-mention-ids";

// Tells people newly @mentioned in a task's description, on creation or
// edit. createNotification drops anyone without access to the project.
export async function notifyTaskDescriptionMentions(
  task: { id: string; title: string; description?: string | null },
  before: string | null | undefined,
  userId: string | undefined,
) {
  const mentioned = newMentionIds(before, task.description, userId);
  if (!mentioned.length) return;
  const editor = userId
    ? (
        await db
          .select({ name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, userId))
          .limit(1)
      )[0]
    : undefined;
  for (const mentionedId of mentioned)
    await createNotification({
      userId: mentionedId,
      type: "task_mention",
      eventData: {
        taskTitle: task.title,
        mentionerName: editor?.name ?? null,
      },
      resourceId: task.id,
      resourceType: "task",
    });
}
