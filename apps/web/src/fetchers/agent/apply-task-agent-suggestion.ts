import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

/** What Apply changed: an estimate may also assign and set dates. */
export type AppliedSuggestion = InferResponseType<
  (typeof client)["agent"]["task"][":taskId"]["suggestions"][":suggestionId"]["apply"]["$post"],
  200
>;

async function applyTaskAgentSuggestion(
  taskId: string,
  suggestionId: string,
): Promise<AppliedSuggestion> {
  const response = await client.agent.task[":taskId"].suggestions[
    ":suggestionId"
  ].apply.$post({
    param: { taskId, suggestionId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default applyTaskAgentSuggestion;
