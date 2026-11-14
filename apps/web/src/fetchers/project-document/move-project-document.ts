import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function moveProjectDocument(
  id: string,
  json: { parentId: string | null; index: number },
) {
  const response = await client["project-document"][":id"].move.$put({
    param: { id },
    json,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
