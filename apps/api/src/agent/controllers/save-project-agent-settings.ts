import { and, eq, inArray, sql } from "drizzle-orm";
import db from "../../database";
import {
  agentRunTable,
  projectAgentSettingTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { getProjectAgentSettings } from "./get-project-agent-settings";

const utcNow = sql`(now() AT TIME ZONE 'utc')`;

export type ProjectAgentSettingsInput = {
  enabled: boolean;
  autoAssess: boolean;
  repository: string | null;
  baseBranch: string;
  instructions: string;
  readyThreshold: number;
};

export async function saveProjectAgentSettings(
  projectId: string,
  userId: string,
  input: ProjectAgentSettingsInput,
) {
  const values = { ...input, updatedByUserId: userId };
  await db.transaction(async (tx) => {
    await tx
      .insert(projectAgentSettingTable)
      .values({ projectId, ...values })
      .onConflictDoUpdate({
        target: projectAgentSettingTable.projectId,
        set: values,
      });
    if (input.enabled) return;
    // Turning the agent off stops its work in the project.
    const projectTasks = tx
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(eq(taskTable.projectId, projectId));
    await tx
      .update(agentRunTable)
      .set({ status: "cancelled", finishedAt: utcNow, errorCode: "disabled" })
      .where(
        and(
          eq(agentRunTable.status, "queued"),
          inArray(agentRunTable.taskId, projectTasks),
        ),
      );
    await tx
      .update(agentRunTable)
      .set({ cancelRequestedAt: utcNow })
      .where(
        and(
          eq(agentRunTable.status, "running"),
          inArray(agentRunTable.taskId, projectTasks),
        ),
      );
  });
  await publishEvent("agent.settings_changed", { projectId });
  return getProjectAgentSettings(projectId);
}
