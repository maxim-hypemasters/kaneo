import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function updateProjectLink(
  projectId: string,
  id: string,
  changes: { url: string; title: string },
) {
  const response = await client["project-link"].project[":projectId"][
    ":id"
  ].$patch({ param: { projectId, id }, json: changes });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
