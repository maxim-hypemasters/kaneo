import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { CommentedDocument } from "./types";

export async function replyToDocumentComment(
  document: CommentedDocument,
  threadId: string,
  content: string,
) {
  const json = { content };
  const response =
    document.kind === "page"
      ? await client["project-document"][":id"].comments[
          ":commentId"
        ].replies.$post({
          param: { id: document.documentId, commentId: threadId },
          json,
        })
      : await client.feature[":id"].documents[":documentId"].comments[
          ":commentId"
        ].replies.$post({
          param: {
            id: document.featureId,
            documentId: document.documentId,
            commentId: threadId,
          },
          json,
        });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
