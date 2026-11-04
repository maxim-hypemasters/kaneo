import { createHash } from "node:crypto";
import type { readScheduleInput } from "./read-input";

type Loaded = Awaited<ReturnType<typeof readScheduleInput>>;

export const digest = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");

export function publishedTasks(loaded: Loaded) {
  return loaded.tasks.map((task) => ({
    taskId: task.id,
    assigneeId:
      task.scheduleSegments != null ? task.scheduledAssigneeId : task.userId,
    start: task.startDate?.toISOString() ?? null,
    end: task.dueDate?.toISOString() ?? null,
    segments: task.scheduleSegments ?? [],
    reason: null,
  }));
}
