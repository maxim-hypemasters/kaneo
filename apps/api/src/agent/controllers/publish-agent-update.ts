import { publishEvent } from "../../events";

/** Tells open task views to refetch the task's agent state. */
export async function publishAgentUpdate(taskId: string, projectId: string) {
  await publishEvent("agent.updated", { taskId, projectId });
}
