import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type TaskAgent = InferResponseType<
  (typeof client)["agent"]["task"][":taskId"]["$get"],
  200
>;
export type AgentAssessment = NonNullable<TaskAgent["assessment"]>;
export type AgentQuestion = AgentAssessment["questions"][number];
export type AgentSuggestion = AgentAssessment["suggestions"][number];
export type AgentDescriptionSuggestion = Extract<
  AgentSuggestion,
  { kind: "description" }
>;
export type AgentClarification = TaskAgent["clarifications"][number];
export type AgentRun = NonNullable<TaskAgent["ship"]["lastRun"]>;
export type AgentRunEvent = TaskAgent["ship"]["events"][number];
export type ShipBlocker = TaskAgent["ship"]["blockers"][number];
export type ReadinessVerdict = AgentAssessment["verdict"];

async function getTaskAgent(taskId: string) {
  const response = await client.agent.task[":taskId"].$get({
    param: { taskId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getTaskAgent;
