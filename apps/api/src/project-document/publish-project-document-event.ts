import { publishEvent } from "../events";
import type { ProjectDocumentScope } from "./schema";

export type ProjectDocumentEvent =
  | "project.document.created"
  | "project.document.updated"
  | "project.document.moved"
  | "project.document.deleted";

export async function publishProjectDocumentEvent(
  scope: ProjectDocumentScope,
  type: ProjectDocumentEvent,
  documentId: string,
) {
  await publishEvent(type, {
    projectId: scope.projectId,
    documentId,
    userId: scope.userId,
  });
}
