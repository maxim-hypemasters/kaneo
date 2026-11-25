import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { CommentedDocument } from "./types";

export async function updateDocumentComment(
  document: CommentedDocument,
  commentId: string,
  content: string,
) {
  const json = { content };
  const response =
    document.kind === "page"
      ? await client["project-document"][":id"].comments[":commentId"].$put({
          param: { id: document.documentId, commentId },
          json,
        })
      : await client.feature[":id"].documents[":documentId"].comments[
          ":commentId"
        ].$put({
          param: {
            id: document.featureId,
            documentId: document.documentId,
            commentId,
          },
          json,
        });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
