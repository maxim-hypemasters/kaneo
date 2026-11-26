import db from "../../database";
import { activityTable } from "../../database/schema";
import { publishEvent } from "../../events";

export const AGENT_COMMENT_SOURCE = "hermes";
const AGENT_NAME = "Hermes Agent";
export const STOPPED_COMMENT = "Stopped working on this task.";

/**
 * Posts a comment as the agent, the way synced GitHub comments appear. It is
 * not mirrored to integrations: comment.created is for people's comments.
 */
export async function postAgentComment(input: {
  taskId: string;
  projectId: string;
  content: string;
  // Unique per task: a comment with a URL the task already has is skipped,
  // so callers key it to the run when each run should get its own comment.
  externalUrl?: string;
}) {
  await db
    .insert(activityTable)
    .values({
      taskId: input.taskId,
      type: "comment",
      userId: null,
      content: input.content,
      externalUserName: AGENT_NAME,
      externalSource: AGENT_COMMENT_SOURCE,
      externalUrl: input.externalUrl ?? null,
    })
    .onConflictDoNothing({
      target: [
        activityTable.taskId,
        activityTable.externalSource,
        activityTable.externalUrl,
      ],
    });
  await publishEvent("agent.comment_created", {
    taskId: input.taskId,
    projectId: input.projectId,
  });
}
