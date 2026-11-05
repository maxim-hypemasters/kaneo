import type Task from "@/types/task";
import type { ProjectSchedule } from "@/components/scheduling/project-schedule";
import type { ScheduledLeaf } from "./gantt-types";
import { parseTaskDate } from "./timeline";

type Member = { id: string; name?: string | null; image?: string | null };
export function scheduledWork(
  tasks: readonly Task[],
  schedule: ProjectSchedule | undefined,
  members: readonly Member[],
): ScheduledLeaf[] {
  const placements = new Map(
    schedule?.tasks.map((task) => [task.taskId, task]),
  );
  const membersById = new Map(members.map((member) => [member.id, member]));
  const legacy = !schedule || schedule.legacy;
  return tasks
    .flatMap((task) => {
      if (task.type === "feature" || task.status === null) return [];
      const placement = placements.get(task.id);
      // Missing applied placement means unscheduled; preserved manual dates
      // are only displayed before the project's first successful Apply.
      const start = parseTaskDate(
        placement?.start ?? (legacy ? (task.startDate ?? task.dueDate) : null),
      );
      const end = parseTaskDate(
        placement?.end ?? (legacy ? (task.dueDate ?? task.startDate) : null),
      );
      if (!start || !end) return [];
      const member = placement?.assigneeId
        ? membersById.get(placement.assigneeId)
        : null;
      return [
        {
          ...task,
          ...(placement && !legacy
            ? {
                userId: placement.assigneeId,
                assigneeId: placement.assigneeId,
                assigneeName:
                  member?.name ??
                  (placement.assigneeId === task.userId
                    ? task.assigneeName
                    : null),
                assigneeImage: member?.image ?? null,
              }
            : {}),
          status: task.status,
          type: task.type === "bug" ? ("bug" as const) : ("task" as const),
          scheduleStart: start <= end ? start : end,
          scheduleEnd: end >= start ? end : start,
          scheduleApplied: !legacy && Boolean(placement?.segments.length),
          scheduleSegments:
            !legacy && placement?.segments.length
              ? (placement?.segments ?? []).map((segment) => ({
                  start: new Date(segment.start),
                  end: new Date(segment.end),
                }))
              : undefined,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.scheduleStart.getTime() - right.scheduleStart.getTime(),
    );
}
