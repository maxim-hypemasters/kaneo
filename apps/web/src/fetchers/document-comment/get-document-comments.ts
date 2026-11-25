import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { CommentedDocument } from "./types";

export async function getDocumentComments(document: CommentedDocument) {
  const response =
    document.kind === "page"
      ? await client["project-document"][":id"].comments.$get({
          param: { id: document.documentId },
        })
      : await client.feature[":id"].documents[":documentId"].comments.$get({
          param: { id: document.featureId, documentId: document.documentId },
        });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
