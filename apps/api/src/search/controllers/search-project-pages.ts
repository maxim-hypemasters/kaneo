import { and, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import db from "../../database";
import {
  projectDocumentTable,
  projectTable,
  workspaceTable,
} from "../../database/schema";
import { documentExcerpt } from "../document-excerpt";
import type { SearchResult } from "../search-result";

// Project pages matching the query in projects the caller can open. They are
// `document` results without a Feature; callers check document:read first.
export async function searchProjectPages({
  query,
  searchPattern,
  workspaceFilter,
  projectId,
  limit,
}: {
  query: string;
  searchPattern: string;
  workspaceFilter: SQL | undefined;
  projectId?: string;
  limit: number;
}): Promise<SearchResult[]> {
  const relevanceScore = sql<number>`
    CASE
      WHEN LOWER(${projectDocumentTable.title}) LIKE ${searchPattern} THEN 3
      ELSE 2
    END
  `;
  const pages = await db
    .select({
      id: projectDocumentTable.id,
      title: projectDocumentTable.title,
      body: projectDocumentTable.body,
      projectId: projectDocumentTable.projectId,
      projectName: projectTable.name,
      projectSlug: projectTable.slug,
      workspaceId: projectTable.workspaceId,
      workspaceName: workspaceTable.name,
      userId: projectDocumentTable.updatedBy,
      userName: projectDocumentTable.updatedByName,
      createdAt: projectDocumentTable.createdAt,
      relevanceScore: relevanceScore.as("relevanceScore"),
    })
    .from(projectDocumentTable)
    .innerJoin(
      projectTable,
      eq(projectDocumentTable.projectId, projectTable.id),
    )
    .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(
      and(
        workspaceFilter,
        projectId ? eq(projectDocumentTable.projectId, projectId) : undefined,
        or(
          ilike(projectDocumentTable.title, searchPattern),
          ilike(projectDocumentTable.body, searchPattern),
        ),
      ),
    )
    .orderBy(desc(relevanceScore), desc(projectDocumentTable.updatedAt))
    .limit(limit);

  return pages.map((page) => ({
    id: page.id,
    type: "document",
    title: page.title,
    content: documentExcerpt(page.body, query),
    projectId: page.projectId,
    projectName: page.projectName,
    projectSlug: page.projectSlug,
    workspaceId: page.workspaceId,
    workspaceName: page.workspaceName || undefined,
    userId: page.userId || undefined,
    userName: page.userName || undefined,
    createdAt: page.createdAt,
    relevanceScore: page.relevanceScore,
  }));
}
