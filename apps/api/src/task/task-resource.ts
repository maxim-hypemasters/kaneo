import type { ScheduleSource } from "./schedule-source";
import { HTTPException } from "hono/http-exception";
import type { TaskType } from "./task-type";

type StoredResource = {
  type: TaskType;
  status: string | null;
  priority: string | null;
  columnId: string | null;
  userId: string | null;
  estimateSeconds?: number | null;
  scheduleSource?: ScheduleSource;
  scheduleSegments?: unknown;
  legacyStartDate?: Date | null;
  legacyDueDate?: Date | null;
  scheduledAssigneeId?: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  releaseId: string | null;
  featureId: string | null;
  milestoneId: string | null;
  archivedAt: Date | null;
};

export function publicTaskFields<
  T extends {
    legacyStartDate?: Date | null;
    legacyDueDate?: Date | null;
    scheduleSegments?: unknown;
    scheduledAssigneeId?: string | null;
  },
>(row: T) {
  const {
    legacyStartDate: _legacyStart,
    legacyDueDate: _legacyDue,
    scheduleSegments: _segments,
    scheduledAssigneeId: _plannedAssignee,
    ...publicRow
  } = row;
  return publicRow;
}

// Shape the public resource by entity rather than widening execution fields
// to nullable for every Task/Bug consumer. Preserve decorations from the read.
export function taskResource<T extends StoredResource>(row: T) {
  const publicRow = publicTaskFields(row);
  if (row.type === "feature") {
    return {
      ...publicRow,
      type: "feature" as const,
      status: null,
      priority: null,
      columnId: null,
      userId: null,
      estimateSeconds: null,
      scheduleSource: "none" as const,
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
    ...publicRow,
    type: row.type,
    status: row.status,
    priority: row.priority,
    estimateSeconds: row.estimateSeconds ?? null,
    scheduleSource:
      row.scheduleSource ??
      (!row.startDate && !row.dueDate
        ? ("none" as const)
        : row.scheduleSegments != null
          ? ("applied" as const)
          : ("legacy" as const)),
    archivedAt: null,
  };
}
