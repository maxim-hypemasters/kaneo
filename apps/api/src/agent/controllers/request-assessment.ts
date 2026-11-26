import { publishAgentUpdate } from "./publish-agent-update";
import { requireAgentTask } from "./require-agent-task";
import { scheduleAssessment } from "./schedule-assessment";

export async function requestAssessment(taskId: string, userId: string) {
  const { task, inputHash } = await requireAgentTask(taskId);
  await scheduleAssessment(taskId, { inputHash, requestedByUserId: userId });
  await publishAgentUpdate(taskId, task.projectId);
}
