import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function getProjectDocument(id: string) {
  const response = await client["project-document"][":id"].$get({
    param: { id },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
