import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function getProjectDocuments(projectId: string) {
  const response = await client["project-document"].project[":projectId"].$get({
    param: { projectId },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
