import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function deleteProjectLink(projectId: string, id: string) {
  const response = await client["project-link"].project[":projectId"][
    ":id"
  ].$delete({ param: { projectId, id } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
