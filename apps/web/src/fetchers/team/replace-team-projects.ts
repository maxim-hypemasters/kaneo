import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function replaceTeamProjects(id: string, projectIds: string[]) {
  const response = await client.team[":id"].projects.$put({
    param: { id },
    json: { projectIds },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
