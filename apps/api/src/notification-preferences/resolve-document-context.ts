import { eq } from "drizzle-orm";
import db from "../database";
import {
  featureDocumentTable,
  projectDocumentTable,
  projectTable,
  taskTable,
  workspaceTable,
} from "../database/schema";
import type { DocumentResourceType } from "../notification/document-resource";

export type ResolvedDocument = {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  documentId: string;
  documentTitle: string;
  kind: "page" | "feature";
  featureId: string | null;
};

// Where a page or Feature document is now. Read from the database rather
// than the notification's eventData, which keeps what was true when it was
// written: a Feature may have moved to another project since.
export async function resolveDocumentContext(
  resourceType: DocumentResourceType,
  documentId: string,
): Promise<ResolvedDocument | null> {
  if (resourceType === "project_document") {
    const [page] = await db
      .select({
        documentId: projectDocumentTable.id,
        documentTitle: projectDocumentTable.title,
        projectId: projectTable.id,
        projectName: projectTable.name,
        workspaceId: workspaceTable.id,
        workspaceName: workspaceTable.name,
      })
      .from(projectDocumentTable)
      .innerJoin(
        projectTable,
        eq(projectDocumentTable.projectId, projectTable.id),
      )
      .innerJoin(
        workspaceTable,
        eq(projectTable.workspaceId, workspaceTable.id),
      )
      .where(eq(projectDocumentTable.id, documentId))
      .limit(1);
    return page ? { ...page, kind: "page", featureId: null } : null;
  }

  const [document] = await db
    .select({
      documentId: featureDocumentTable.id,
      documentTitle: featureDocumentTable.title,
      featureId: featureDocumentTable.featureId,
      projectId: projectTable.id,
      projectName: projectTable.name,
      workspaceId: workspaceTable.id,
      workspaceName: workspaceTable.name,
    })
    .from(featureDocumentTable)
    .innerJoin(taskTable, eq(featureDocumentTable.featureId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .innerJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(eq(featureDocumentTable.id, documentId))
    .limit(1);
  return document ? { ...document, kind: "feature" } : null;
}
