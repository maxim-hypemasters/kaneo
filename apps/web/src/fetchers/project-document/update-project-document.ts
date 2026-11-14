import { client } from "@kaneo/libs";
import type { DocumentSaveInput } from "@/components/documents/document-save-input";
import { HttpError } from "@/lib/http-error";

export async function updateProjectDocument(
  id: string,
  json: DocumentSaveInput & { keepRemovedAssets?: boolean },
) {
  const response = await client["project-document"][":id"].$put({
    param: { id },
    json,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
