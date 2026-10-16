type TaskLabel = {
  id: string;
  name: string;
  color: string;
};

type TaskExternalLink = {
  id: string;
  taskId: string;
  integrationId: string | null;
  resourceType: string;
  externalId: string;
  url: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
};

type TaskCustomFieldValue = {
  fieldId: string;
  value: string | null;
};

export type TaskType = "task" | "feature";

type Task = {
  id: string;
  title: string;
  number: number | null;
  description: string | null;
  descriptionDeferred?: boolean;
  status: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  position: number | null;
  createdAt: string;
  updatedAt?: string;
  userId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage?: string | null;
  projectId: string;
  columnId?: string | null;
  // "feature" groups tasks of its project; a task belongs to at most one.
  // Optional while older cached data and hand-built tasks lack them.
  type?: TaskType;
  featureId?: string | null;
  // For a feature: its tasks, and how many are done.
  subtaskCounts?: { completed: number; total: number };
  labels?: TaskLabel[];
  externalLinks?: TaskExternalLink[];
  customFieldValues?: TaskCustomFieldValue[];
};

export default Task;
