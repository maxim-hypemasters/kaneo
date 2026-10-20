import { HTTPException } from "hono/http-exception";
import type { TaskType } from "./task-type";

type StoredResource = {
  type: TaskType;
  status: string | null;
  priority: string | null;
  columnId: string | null;
  userId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  releaseId: string | null;
  featureId: string | null;
  milestoneId: string | null;
  archivedAt: Date | null;
};

// Shape the public resource by entity rather than widening execution fields
// to nullable for every Task/Bug consumer. Preserve decorations from the read.
export function taskResource<T extends StoredResource>(row: T) {
  if (row.type === "feature") {
    return {
      ...row,
      type: "feature" as const,
      status: null,
      priority: null,
      columnId: null,
      userId: null,
      startDate: null,
      dueDate: null,
      releaseId: null,
      featureId: null,
      milestoneId: null,
    };
  }
  if (row.status === null || row.priority === null)
    throw new HTTPException(500, {
      message: "Execution work is missing planning fields",
    });
  return {
    ...row,
    type: row.type,
    status: row.status,
    priority: row.priority,
    archivedAt: null,
  };
}
