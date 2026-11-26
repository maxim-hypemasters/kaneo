import { subscribeToEvent } from "../events";
import { isAiAgentEnabled } from "./agent-enabled";
import { AUTO_ASSESS_DELAY_MS } from "./constants";
import { loadAssessment } from "./controllers/get-task-agent";
import { loadAgentTask } from "./controllers/load-agent-task";
import { loadProjectAgentSetting } from "./controllers/load-project-agent-setting";
import { publishAgentUpdate } from "./controllers/publish-agent-update";
import { scheduleAssessment } from "./controllers/schedule-assessment";

// Only people's edits trigger an assessment. Integration syncs, imports and
// drafts created with a Feature or milestone can add many tasks at once (or
// come from outside the workspace), so those tasks are assessed when someone
// asks or edits them.
async function autoAssess(taskId: string) {
  if (!isAiAgentEnabled()) return;
  const loaded = await loadAgentTask(taskId);
  if (!loaded || !loaded.task.isWorkItem || loaded.task.archived) return;
  const setting = await loadProjectAgentSetting(loaded.task.projectId);
  if (!setting.enabled || !setting.autoAssess) return;
  const assessment = await loadAssessment(taskId);
  if (assessment?.inputHash === loaded.inputHash) return;
  await scheduleAssessment(taskId, {
    inputHash: loaded.inputHash,
    delayMs: AUTO_ASSESS_DELAY_MS,
  });
  await publishAgentUpdate(taskId, loaded.task.projectId);
}

subscribeToEvent<{
  taskId: string;
  type?: string;
  currentUserId?: string;
  source?: string;
  bulk?: boolean;
}>("task.created", async (data) => {
  if (
    data.type !== "created" ||
    !data.currentUserId ||
    data.source ||
    data.bulk
  )
    return;
  await autoAssess(data.taskId);
});

for (const eventName of ["task.title_changed", "task.description_changed"]) {
  subscribeToEvent<{
    taskId: string;
    userId?: string;
    sourceIntegrationId?: string;
  }>(eventName, async (data) => {
    if (!data.userId || data.sourceIntegrationId) return;
    await autoAssess(data.taskId);
  });
}
