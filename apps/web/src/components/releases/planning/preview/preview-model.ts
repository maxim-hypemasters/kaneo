import type {
  GanttDependency,
  GanttSpan,
} from "@/components/gantt/gantt-dependencies";
import {
  getBarGridColumns,
  parseTaskDate,
  type GanttTimeline,
} from "@/components/gantt/timeline";
import { lastScheduledInstant } from "@/components/gantt/schedule-geometry";
import type { ReleasePlanPreview, ReleasePlanTask } from "@/types/release-plan";

export type PreviewWork = ReleasePlanTask & {
  projectId: string;
  scheduleStart: Date;
  scheduleEnd: Date;
  workSegments: { start: Date; end: Date }[];
};
export type PreviewLane = {
  key: string;
  assigneeId: string | null;
  name: string | null;
  tasks: PreviewWork[];
  start: Date;
  end: Date;
};

function datedTask(
  task: ReleasePlanTask,
  projectId: string,
): PreviewWork | null {
  const start = parseTaskDate(task.start);
  const end = parseTaskDate(task.end);
  if (!start || !end || end < start) return null;
  const segments = task.segments.flatMap((segment) => {
    const from = parseTaskDate(segment.start);
    const to = parseTaskDate(segment.end);
    return from && to && to > from ? [{ start: from, end: to }] : [];
  });
  if (!segments.length && !task.completed) return null;
  return {
    ...task,
    projectId,
    scheduleStart: start,
    scheduleEnd: end,
    workSegments: segments,
  };
}

export function previewModel(preview: ReleasePlanPreview, projectId: string) {
  const scheduled: PreviewWork[] = [];
  const unscheduled: ReleasePlanTask[] = [];
  for (const task of preview.tasks) {
    if (task.reason === "archived") continue;
    const dated = datedTask(task, projectId);
    if (dated) scheduled.push(dated);
    else if (!task.completed) unscheduled.push(task);
  }
  const byAssignee = new Map<string, PreviewLane>();
  for (const task of scheduled) {
    const key = task.assigneeId ?? "";
    const lane = byAssignee.get(key);
    const end = previewDisplayEnd(task);
    if (!lane)
      byAssignee.set(key, {
        key,
        assigneeId: task.assigneeId,
        name: task.assigneeName,
        tasks: [task],
        start: task.scheduleStart,
        end,
      });
    else {
      lane.tasks.push(task);
      lane.name ??= task.assigneeName;
      if (task.scheduleStart < lane.start) lane.start = task.scheduleStart;
      if (end > lane.end) lane.end = end;
    }
  }
  const lanes = [...byAssignee.values()].sort(
    (a, b) =>
      Number(a.assigneeId === null) - Number(b.assigneeId === null) ||
      (a.name ?? "").localeCompare(b.name ?? "") ||
      a.key.localeCompare(b.key),
  );
  for (const lane of lanes)
    lane.tasks.sort(
      (a, b) =>
        a.scheduleStart.getTime() - b.scheduleStart.getTime() ||
        (a.number ?? Infinity) - (b.number ?? Infinity) ||
        a.taskId.localeCompare(b.taskId),
    );
  const spans = new Map<string, GanttSpan>(
    scheduled.map((task) => [
      task.taskId,
      {
        start: task.scheduleStart,
        end: task.scheduleEnd,
        precise: task.workSegments.length > 0,
        completed: task.completed,
      },
    ]),
  );
  const dependencies: GanttDependency[] = (preview.dependencies ?? []).map(
    (edge) => ({
      ...edge,
      id: JSON.stringify([edge.blockerId, edge.blockedId]),
    }),
  );
  return {
    scheduled,
    lanes,
    spans,
    dependencies,
    unscheduled,
  };
}

function previewDisplayEnd(task: PreviewWork) {
  return task.workSegments.length
    ? lastScheduledInstant(task.scheduleStart, task.scheduleEnd)
    : task.scheduleEnd;
}

export function previewBarColumns(
  task: PreviewWork,
  timeline: Pick<GanttTimeline, "rangeStart" | "days">,
) {
  return getBarGridColumns(
    task.scheduleStart,
    previewDisplayEnd(task),
    timeline.rangeStart,
    timeline.days.length,
  );
}

export function clearsPlacement(task: ReleasePlanTask) {
  return !task.completed && Boolean(task.currentStart || task.currentEnd);
}
