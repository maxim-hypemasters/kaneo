import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function reorderProjectLinks(
  projectId: string,
  links: Array<{ id: string; position: number }>,
) {
  const response = await client["project-link"].project[
    ":projectId"
  ].reorder.$put({ param: { projectId }, json: { links } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
