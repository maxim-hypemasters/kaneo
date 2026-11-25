import db, { schema } from "../../../apps/api/src/database";
import { createApp } from "../../../apps/api/src/index";
import { insertTask } from "./release/insert-task";
import { jsonRequest } from "./release/json-request";

export const commentKinds = ["page", "feature"] as const;
export type CommentKind = (typeof commentKinds)[number];

export type Anchor = { quote: string; prefix: string; suffix: string };
export type Comment = {
  id: string;
  parentId: string | null;
  userId: string | null;
  userName: string | null;
  userImage: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
};
export type Thread = Comment & {
  anchor: Anchor;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  replies: Comment[];
};

export const anchor = (quote: string): Anchor => ({
  quote,
  prefix: "before ",
  suffix: " after",
});

// A project with a Feature, and documents of one kind in it. `at(id)` is the
// document's API path, so the same test body drives pages and Feature
// documents.
export async function commentDocuments(kind: CommentKind, projectId: string) {
  const feature = await insertTask(projectId, {
    type: "feature",
    title: "Search",
  });
  const app = createApp().app;
  const request = (path: string, method = "GET", body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const at = (documentId: string) =>
    kind === "page"
      ? `/project-document/${documentId}`
      : `/feature/${feature.id}/documents/${documentId}`;
  const insert = async (title: string, body = "") => {
    const [document] =
      kind === "page"
        ? await db
            .insert(schema.projectDocumentTable)
            .values({ projectId, title, body })
            .returning({ id: schema.projectDocumentTable.id })
        : await db
            .insert(schema.featureDocumentTable)
            .values({ featureId: feature.id, title, body })
            .returning({ id: schema.featureDocumentTable.id });
    return document!.id;
  };
  const documentId = await insert("Handbook", "before quoted text after");
  const comments = (path = "", method = "GET", body?: unknown) =>
    request(`${at(documentId)}/comments${path}`, method, body);
  const start = async (content = "First", quote = "quoted text") => {
    const response = await comments("", "POST", {
      content,
      anchor: anchor(quote),
    });
    if (response.status !== 200)
      throw new Error(`Thread not created: ${response.status}`);
    return (await response.json()) as Thread;
  };
  const list = async () => (await (await comments()).json()) as Thread[];
  return {
    kind,
    feature,
    documentId,
    request,
    at,
    insert,
    comments,
    start,
    list,
  };
}
