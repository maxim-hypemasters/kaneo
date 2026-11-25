import { client } from "@kaneo/libs";
import type { DocumentSaveInput } from "@/components/documents/document-save-input";
import type { CommentAnchorUpdate } from "@/components/editor/comments/comment-anchor";
import { HttpError } from "@/lib/http-error";

export async function updateProjectDocument(
  id: string,
  json: DocumentSaveInput & {
    keepRemovedAssets?: boolean;
    // Comment threads whose quoted text this save moved or changed.
    commentAnchors?: CommentAnchorUpdate[];
  },
) {
  const response = await client["project-document"][":id"].$put({
    param: { id },
    json,
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
