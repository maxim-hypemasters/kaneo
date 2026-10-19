import { client } from "@kaneo/libs";

import type { TaskType } from "@/types/task";
import { HttpError } from "@/lib/http-error";
export type TaskToImport = {
  labels?: Array<{ name: string; color: string }>;
  key?: string;
  type?: TaskType;
  featureKey?: string | null;
  milestoneKey?: string | null;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  startDate?: string;
  dueDate?: string;
  userId?: string | null;
};

export type ImportDocument = {
  version?: 2;
  tasks: TaskToImport[];
  milestones?: Array<{
    key: string;
    featureKey: string;
    title: string;
    description?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    position: number;
  }>;
};

async function importTasks(
  projectId: string,
  document: ImportDocument | TaskToImport[],
) {
  const response = await client.task.import[":projectId"].$post({
    param: { projectId },
    json: Array.isArray(document) ? { tasks: document } : document,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();
  return data;
}

export default importTasks;
