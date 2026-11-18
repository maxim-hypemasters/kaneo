import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function unlinkTeamProject(id: string, projectId: string) {
  const response = await client.team[":id"].projects[":projectId"].$delete({
    param: { id, projectId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
