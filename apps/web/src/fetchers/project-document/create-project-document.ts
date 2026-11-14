import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function createProjectDocument(
  projectId: string,
  json: { title: string; parentId?: string | null },
) {
  const response = await client["project-document"].project[":projectId"].$post(
    { param: { projectId }, json: { ...json, body: "" } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
