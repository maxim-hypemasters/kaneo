import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import db from "../../database";
import {
  activityTable,
  featureDocumentTable,
  projectTable,
  taskTable,
  userTable,
  workspaceTable,
  workspaceUserTable,
} from "../../database/schema";
import { redactInaccessibleActivity } from "../../activity/redaction/redact-inaccessible-activity";
import { canAccessProject } from "../../project-access/can-access-project";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import {
  activityResultTitle,
  activitySearchContent,
  activitySubjectOf,
} from "../activity-search-text";
import { documentExcerpt } from "../document-excerpt";
import { escapeLikePattern } from "../like-pattern";
import { redactedActivityScore } from "../redacted-activity-score";
import type { SearchResult } from "../search-result";
import { TASK_SHORT_ID_PATTERN } from "../task-short-id";
import { workSearchResult } from "../work-search-result";

type SearchParams = {
  query: string;
  userEmail?: string;
  userId?: string;
  type?:
    | "all"
    | "tasks"
    | "features"
    | "projects"
    | "workspaces"
    | "comments"
    | "activities"
    | "documents";
  workspaceId?: string;
  projectId?: string;
  limit?: number;
};

async function globalSearch(params: SearchParams): Promise<{
  results: SearchResult[];
  totalCount: number;
  searchQuery: string;
}> {
  const {
    query,
    userId,
    userEmail,
    type = "all",
    workspaceId,
    projectId,
    limit = 20,
  } = params;

  let resolvedUserId = userId;
  if (!resolvedUserId && userEmail) {
    const user = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, userEmail))
      .limit(1);

    if (user.length > 0 && user[0]) {
      resolvedUserId = user[0].id;
    }
  }

  if (!resolvedUserId) {
    return { results: [], totalCount: 0, searchQuery: query };
  }

  const userWorkspaces = await db
    .select({ workspaceId: workspaceUserTable.workspaceId })
    .from(workspaceUserTable)
    .where(eq(workspaceUserTable.userId, resolvedUserId));

  const accessibleWorkspaceIds = userWorkspaces
    .map((w) => w.workspaceId)
    .filter(Boolean);

  if (
    accessibleWorkspaceIds.length === 0 ||
    (projectId && !(await canAccessProject(resolvedUserId, projectId)))
  ) {
    return { results: [], totalCount: 0, searchQuery: query };
  }

  const results: SearchResult[] = [];
  const searchPattern = `%${query.toLowerCase()}%`;

  const workspaceFilter = and(
    workspaceId
      ? eq(projectTable.workspaceId, workspaceId)
      : inArray(projectTable.workspaceId, accessibleWorkspaceIds),
    projectAccessCondition(resolvedUserId, projectTable.id),
  );

  // Check if query matches short-id pattern (e.g. "DEP-23"). `generateProjectSlug`
  // normalizes to NFKC before it stores a key, so the query is normalized too,
  // or a decomposed "ПА-23" would never reach the stored composed form.
  const shortIdMatch = query.normalize("NFKC").match(TASK_SHORT_ID_PATTERN);

  const shortIdNumber = Number(shortIdMatch?.[2]);

  if (type === "all" || type === "tasks" || type === "features") {
    const seenTaskIds = new Set<string>();
    const workTypeFilter =
      type === "tasks"
        ? inArray(taskTable.type, ["task", "bug"])
        : type === "features"
          ? eq(taskTable.type, "feature")
          : undefined;

    // If query matches short-id pattern, look up by project slug + task number first
    if (
      shortIdMatch?.[1] &&
      Number.isSafeInteger(shortIdNumber) &&
      shortIdNumber > 0 &&
      shortIdNumber <= 2_147_483_647
    ) {
      const slug = shortIdMatch[1];
      const taskNumber = shortIdNumber;

      const shortIdTasks = await db
        .select({
          id: taskTable.id,
          title: taskTable.title,
          description: taskTable.description,
          projectId: taskTable.projectId,
          projectName: projectTable.name,
          projectSlug: projectTable.slug,
          workspaceId: projectTable.workspaceId,
          workspaceName: workspaceTable.name,
          userId: taskTable.userId,
          userName: userTable.name,
          createdAt: taskTable.createdAt,
          taskNumber: taskTable.number,
          priority: taskTable.priority,
          status: taskTable.status,
          taskType: taskTable.type,
          archivedAt: taskTable.archivedAt,
        })
        .from(taskTable)
        .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .leftJoin(
          workspaceTable,
          eq(projectTable.workspaceId, workspaceTable.id),
        )
        .leftJoin(userTable, eq(taskTable.userId, userTable.id))
        .where(
          and(
            workspaceFilter,
            projectId ? eq(taskTable.projectId, projectId) : undefined,
            workTypeFilter,
            // A project key may hold `_`, which `ilike` reads as "any one
            // character", so `DE_-23` would also match a task in `DEP` and the
            // `limit(1)` below would pick whichever came back first. Escaping
            // keeps the case-insensitive comparison and drops the wildcards.
            ilike(projectTable.slug, escapeLikePattern(slug)),
            eq(taskTable.number, taskNumber),
          ),
        )
        .limit(1);

      for (const task of shortIdTasks) {
        seenTaskIds.add(task.id);
        // Highest relevance for an exact short-id match.
        results.push(workSearchResult(task, 10));
      }
    }

    // Also run text search for tasks
    const taskRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${taskTable.title}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${taskTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const taskQuery = db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        description: taskTable.description,
        projectId: taskTable.projectId,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        workspaceId: projectTable.workspaceId,
        workspaceName: workspaceTable.name,
        userId: taskTable.userId,
        userName: userTable.name,
        createdAt: taskTable.createdAt,
        taskNumber: taskTable.number,
        priority: taskTable.priority,
        status: taskTable.status,
        taskType: taskTable.type,
        archivedAt: taskTable.archivedAt,
        relevanceScore: taskRelevanceScore.as("relevanceScore"),
      })
      .from(taskTable)
      .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
      .leftJoin(userTable, eq(taskTable.userId, userTable.id))
      .where(
        and(
          workspaceFilter,
          projectId ? eq(taskTable.projectId, projectId) : undefined,
          workTypeFilter,
          or(
            ilike(taskTable.title, searchPattern),
            ilike(taskTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(taskRelevanceScore), desc(taskTable.createdAt))
      .limit(limit);

    const tasks = await taskQuery;

    for (const task of tasks) {
      if (seenTaskIds.has(task.id)) continue;
      results.push(workSearchResult(task, task.relevanceScore));
    }
  }

  if (type === "all" || type === "documents") {
    const documentRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${featureDocumentTable.title}) LIKE ${searchPattern} THEN 3
        ELSE 2
      END
    `;

    // Feature documents carry the same project access as their Feature.
    const documents = await db
      .select({
        id: featureDocumentTable.id,
        title: featureDocumentTable.title,
        body: featureDocumentTable.body,
        featureId: featureDocumentTable.featureId,
        featureTitle: taskTable.title,
        projectId: taskTable.projectId,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        workspaceId: projectTable.workspaceId,
        workspaceName: workspaceTable.name,
        userId: featureDocumentTable.updatedBy,
        userName: featureDocumentTable.updatedByName,
        createdAt: featureDocumentTable.createdAt,
        relevanceScore: documentRelevanceScore.as("relevanceScore"),
      })
      .from(featureDocumentTable)
      .innerJoin(taskTable, eq(featureDocumentTable.featureId, taskTable.id))
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
      .where(
        and(
          workspaceFilter,
          projectId ? eq(taskTable.projectId, projectId) : undefined,
          or(
            ilike(featureDocumentTable.title, searchPattern),
            ilike(featureDocumentTable.body, searchPattern),
          ),
        ),
      )
      .orderBy(
        desc(documentRelevanceScore),
        desc(featureDocumentTable.updatedAt),
      )
      .limit(limit);

    for (const document of documents) {
      results.push({
        id: document.id,
        type: "document",
        title: document.title,
        content: documentExcerpt(document.body, query),
        featureId: document.featureId,
        featureTitle: document.featureTitle,
        projectId: document.projectId,
        projectName: document.projectName,
        projectSlug: document.projectSlug,
        workspaceId: document.workspaceId,
        workspaceName: document.workspaceName || undefined,
        userId: document.userId || undefined,
        userName: document.userName || undefined,
        createdAt: document.createdAt,
        relevanceScore: document.relevanceScore,
      });
    }
  }

  if (type === "all" || type === "projects") {
    const projectRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${projectTable.name}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${projectTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const projectQuery = db
      .select({
        id: projectTable.id,
        name: projectTable.name,
        description: projectTable.description,
        slug: projectTable.slug,
        workspaceId: projectTable.workspaceId,
        workspaceName: workspaceTable.name,
        createdAt: projectTable.createdAt,
        relevanceScore: projectRelevanceScore.as("relevanceScore"),
      })
      .from(projectTable)
      .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
      .where(
        and(
          workspaceFilter,
          or(
            ilike(projectTable.name, searchPattern),
            ilike(projectTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(projectRelevanceScore), desc(projectTable.createdAt))
      .limit(limit);

    const projects = await projectQuery;

    for (const project of projects) {
      results.push({
        id: project.id,
        type: "project",
        title: project.name,
        description: project.description || undefined,
        projectId: project.id,
        projectSlug: project.slug || undefined,
        workspaceId: project.workspaceId,
        workspaceName: project.workspaceName || undefined,
        createdAt: project.createdAt,
        relevanceScore: project.relevanceScore,
      });
    }
  }

  if (type === "all" || type === "workspaces") {
    const workspaceRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${workspaceTable.name}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${workspaceTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const workspaceQuery = db
      .select({
        id: workspaceTable.id,
        name: workspaceTable.name,
        description: workspaceTable.description,
        createdAt: workspaceTable.createdAt,
        relevanceScore: workspaceRelevanceScore.as("relevanceScore"),
      })
      .from(workspaceTable)
      .leftJoin(
        workspaceUserTable,
        eq(workspaceTable.id, workspaceUserTable.workspaceId),
      )
      .where(
        and(
          inArray(workspaceTable.id, accessibleWorkspaceIds),
          or(
            ilike(workspaceTable.name, searchPattern),
            ilike(workspaceTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(workspaceRelevanceScore), desc(workspaceTable.createdAt))
      .limit(limit);

    const workspaces = await workspaceQuery;

    for (const workspace of workspaces) {
      results.push({
        id: workspace.id,
        type: "workspace",
        title: workspace.name,
        description: workspace.description || undefined,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        createdAt: workspace.createdAt,
        relevanceScore: workspace.relevanceScore,
      });
    }
  }

  if (type === "all" || type === "comments" || type === "activities") {
    const searchableActivityText = sql<string>`COALESCE(${activityTable.content}, CAST(${activityTable.eventData} AS text), '')`;
    const activityRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${searchableActivityText}) LIKE ${searchPattern} THEN 2
        WHEN LOWER(${taskTable.title}) LIKE ${searchPattern} THEN 1
        ELSE 1
      END
    `;

    const activityQuery = db
      .select({
        id: activityTable.id,
        type: activityTable.type,
        content: activityTable.content,
        eventData: activityTable.eventData,
        taskId: activityTable.taskId,
        taskTitle: taskTable.title,
        taskNumber: taskTable.number,
        taskType: taskTable.type,
        projectId: projectTable.id,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        workspaceId: projectTable.workspaceId,
        workspaceName: workspaceTable.name,
        userId: activityTable.userId,
        userName: userTable.name,
        createdAt: activityTable.createdAt,
        relevanceScore: activityRelevanceScore.as("relevanceScore"),
      })
      .from(activityTable)
      .leftJoin(taskTable, eq(activityTable.taskId, taskTable.id))
      .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
      .leftJoin(userTable, eq(activityTable.userId, userTable.id))
      .where(
        and(
          workspaceFilter,
          projectId ? eq(taskTable.projectId, projectId) : undefined,
          or(
            ilike(searchableActivityText, searchPattern),
            ilike(taskTable.title, searchPattern),
          ),
          type === "comments" ? eq(activityTable.type, "comment") : undefined,
        ),
      )
      .orderBy(desc(activityRelevanceScore), desc(activityTable.createdAt))
      .limit(limit);

    const found = await activityQuery;
    const redacted = await redactInaccessibleActivity(resolvedUserId, found);

    for (const [index, activity] of redacted.entries()) {
      const relevanceScore =
        activity === found[index]
          ? activity.relevanceScore
          : redactedActivityScore(activity, query, activity.relevanceScore);
      if (relevanceScore === null) continue;
      const subject = activitySubjectOf(activity.taskType);
      results.push({
        id: activity.id,
        type: activity.type === "comment" ? "comment" : "activity",
        title: activityResultTitle(activity.type, activity.taskTitle, subject),
        content: activitySearchContent(
          activity.type,
          activity.content,
          activity.eventData,
          subject,
        ),
        taskId: activity.taskId,
        taskType: activity.taskType ?? undefined,
        projectId: activity.projectId || undefined,
        projectName: activity.projectName || undefined,
        projectSlug: activity.projectSlug || undefined,
        workspaceId: activity.workspaceId || undefined,
        workspaceName: activity.workspaceName || undefined,
        userId: activity.userId || undefined,
        userName: activity.userName || undefined,
        createdAt: activity.createdAt,
        relevanceScore,
        taskNumber: activity.taskNumber || undefined,
      });
    }
  }

  results.sort((a, b) => {
    if (a.relevanceScore !== b.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const finalResults = results.slice(0, limit);

  return {
    results: finalResults,
    totalCount: results.length,
    searchQuery: query,
  };
}

export default globalSearch;
