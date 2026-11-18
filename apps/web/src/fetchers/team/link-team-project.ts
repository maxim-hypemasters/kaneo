import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function linkTeamProject(id: string, projectId: string) {
  const response = await client.team[":id"].projects[":projectId"].$put({
    param: { id, projectId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
