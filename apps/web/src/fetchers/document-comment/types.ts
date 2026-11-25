import type { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

// The document a comment thread is on: a project page, or a Feature document
// together with its Feature.
export type CommentedDocument =
  | { kind: "page"; projectId: string; documentId: string }
  | {
      kind: "feature";
      projectId: string;
      featureId: string;
      documentId: string;
    };

// A thread: its first comment, the document text it is attached to, and its
// replies. Pages and Feature documents answer with the same shape.
export type DocumentCommentThread = InferResponseType<
  (typeof client)["project-document"][":id"]["comments"]["$get"],
  200
>[number];

export type DocumentComment = DocumentCommentThread["replies"][number];
