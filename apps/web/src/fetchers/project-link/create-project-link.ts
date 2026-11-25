import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function createProjectLink(
  projectId: string,
  link: { url: string; title: string },
) {
  const response = await client["project-link"].project[":projectId"].$post({
    param: { projectId },
    json: link,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
