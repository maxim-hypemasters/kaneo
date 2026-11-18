import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function createTeam(workspaceId: string, name: string) {
  const response = await client.team.workspace[":workspaceId"].$post({
    param: { workspaceId },
    json: { name },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
