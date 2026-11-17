import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function removeAssistantSettings(workspaceId: string) {
  const response = await client.assistant[":workspaceId"].settings.$delete({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default removeAssistantSettings;
