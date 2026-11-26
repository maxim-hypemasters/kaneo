import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function revokeAgentRunner(workspaceId: string) {
  const response = await client.agent.workspace[":workspaceId"].runner.$delete({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default revokeAgentRunner;
