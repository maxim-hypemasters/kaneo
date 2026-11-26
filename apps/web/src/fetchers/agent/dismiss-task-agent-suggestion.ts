import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function dismissTaskAgentSuggestion(
  taskId: string,
  suggestionId: string,
) {
  const response = await client.agent.task[":taskId"].suggestions[
    ":suggestionId"
  ].$delete({
    param: { taskId, suggestionId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default dismissTaskAgentSuggestion;
