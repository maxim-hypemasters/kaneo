import type { TaskType } from "../task/task-type";
import type { SearchResult } from "./search-result";

export type WorkSearchRow = {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  projectName: string | null;
  projectSlug: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: Date;
  taskNumber: number | null;
  priority: string | null;
  status: string | null;
  taskType: TaskType;
  archivedAt: Date | null;
};

// A Feature is its own result kind: it has no status or priority, and only it
// can be archived.
export function workSearchResult(
  row: WorkSearchRow,
  relevanceScore: number,
): SearchResult {
  const result = {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    projectId: row.projectId,
    projectName: row.projectName || undefined,
    projectSlug: row.projectSlug || undefined,
    workspaceId: row.workspaceId || undefined,
    workspaceName: row.workspaceName || undefined,
    userId: row.userId || undefined,
    userName: row.userName || undefined,
    createdAt: row.createdAt,
    relevanceScore,
    taskNumber: row.taskNumber || undefined,
    taskType: row.taskType,
  };
  if (row.taskType === "feature") {
    return { ...result, type: "feature", archived: row.archivedAt !== null };
  }
  return {
    ...result,
    type: "task",
    priority: row.priority || undefined,
    status: row.status ?? undefined,
  };
}
