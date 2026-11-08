import type { TaskType } from "../task/task-type";

export type SearchResult = {
  id: string;
  type:
    | "task"
    | "feature"
    | "project"
    | "workspace"
    | "comment"
    | "activity"
    | "document";
  title: string;
  description?: string;
  content?: string;
  projectId?: string;
  projectName?: string;
  workspaceId?: string;
  workspaceName?: string;
  userId?: string;
  userName?: string;
  createdAt: Date;
  relevanceScore: number;
  taskNumber?: number;
  projectSlug?: string;
  priority?: string;
  status?: string;
  taskType?: TaskType;
  taskId?: string;
  archived?: boolean;
  featureId?: string;
  featureTitle?: string;
};
