import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function getProjectLinks(projectId: string) {
  const response = await client["project-link"].project[":projectId"].$get({
    param: { projectId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
