import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function getTeams(workspaceId: string) {
  const response = await client.team.workspace[":workspaceId"].$get({
    param: { workspaceId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
