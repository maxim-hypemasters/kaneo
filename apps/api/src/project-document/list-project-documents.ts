import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  featureDocumentTable,
  projectDocumentTable,
  taskTable,
} from "../database/schema";
import { assertAuthorizedProjectSnapshot } from "../milestone/access-scope";
import { boundedTaskRead } from "../task/bounded-read";
import type { ProjectDocumentScope } from "./schema";

type FeatureGroup = {
  id: string;
  number: number | null;
  title: string;
  documents: { id: string; title: string; updatedAt: Date }[];
};

// The project's page tree plus every active Feature's documents, without
// bodies. Feature documents are listed newest first, as on the Feature, and
// only for callers who may read Features.
export async function listProjectDocuments(
  scope: ProjectDocumentScope,
  { features: includeFeatures }: { features: boolean },
) {
  return boundedTaskRead(async (tx) => {
    await assertAuthorizedProjectSnapshot(
      tx,
      scope.projectId,
      scope.workspaceId,
    );
    const pages = await tx
      .select({
        id: projectDocumentTable.id,
        parentId: projectDocumentTable.parentId,
        position: projectDocumentTable.position,
        title: projectDocumentTable.title,
        updatedByName: projectDocumentTable.updatedByName,
        updatedAt: projectDocumentTable.updatedAt,
      })
      .from(projectDocumentTable)
      .where(eq(projectDocumentTable.projectId, scope.projectId))
      .orderBy(
        asc(projectDocumentTable.position),
        asc(projectDocumentTable.id),
      );
    if (!includeFeatures) return { pages, features: [] };
    const featureDocuments = await tx
      .select({
        id: featureDocumentTable.id,
        title: featureDocumentTable.title,
        updatedAt: featureDocumentTable.updatedAt,
        featureId: taskTable.id,
        featureNumber: taskTable.number,
        featureTitle: taskTable.title,
      })
      .from(featureDocumentTable)
      .innerJoin(taskTable, eq(featureDocumentTable.featureId, taskTable.id))
      .where(
        and(
          eq(taskTable.projectId, scope.projectId),
          eq(taskTable.type, "feature"),
          isNull(taskTable.archivedAt),
        ),
      )
      .orderBy(
        asc(taskTable.title),
        asc(taskTable.id),
        desc(featureDocumentTable.updatedAt),
        desc(featureDocumentTable.id),
      );
    const features = new Map<string, FeatureGroup>();
    for (const row of featureDocuments) {
      const group = features.get(row.featureId) ?? {
        id: row.featureId,
        number: row.featureNumber,
        title: row.featureTitle,
        documents: [],
      };
      group.documents.push({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt,
      });
      features.set(row.featureId, group);
    }
    return { pages, features: [...features.values()] };
  });
}
