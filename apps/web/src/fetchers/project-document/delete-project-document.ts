import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export async function deleteProjectDocument(id: string) {
  const response = await client["project-document"][":id"].$delete({
    param: { id },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
