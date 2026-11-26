import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// The token in the response is shown once; Kaneo keeps only a hash.
async function rotateAgentRunnerToken(workspaceId: string) {
  const response = await client.agent.workspace[
    ":workspaceId"
  ].runner.token.$post({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default rotateAgentRunnerToken;
