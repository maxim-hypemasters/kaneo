import { createCalendarReader, fitWork } from "./calendar";
import { dependencyCycles, inheritedUrgency } from "./dependencies";
import { ReadyTaskQueue } from "./ready-task-queue";
import type {
  PlanningCalendar,
  PlanningTask,
  ScheduledTask,
  ScheduleInput,
  ScheduleReason,
  ScheduleResult,
  ScheduleWarning,
} from "./types";
import {
  addDays,
  localDate,
  startOfLocalDay,
  type TimeInterval,
} from "./zoned-time";

function exclusion(
  task: PlanningTask,
  calendar: PlanningCalendar | undefined,
): ScheduleReason | null {
  if (task.state === "archived") return "archived";
  if (task.state === "backlog") return "backlog";
  if (!task.assigneeId) return "unassigned";
  if (task.estimateSeconds === null) return "no_estimate";
  if (task.estimateSeconds - task.loggedSeconds <= 0)
    return "estimate_exhausted";
  if (!calendar || calendar.weeklyIntervals.length === 0) return "no_calendar";
  return null;
}

export function buildSchedule(
  input: ScheduleInput,
  startBoundary: "now" | "local-day" = "now",
): ScheduleResult {
  const asOf = Date.parse(input.asOf);
  const earliestStart =
    startBoundary === "local-day"
      ? startOfLocalDay(localDate(asOf, input.timeZone), input.timeZone)
      : asOf;
  const planFrom = Math.max(earliestStart, Date.parse(input.planFrom));
  const horizon = planFrom + 3660 * 86_400_000;
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const tasks = input.tasks.filter((task) => task.state !== "done");
  const calendarById = new Map(
    input.calendars.map((calendar) => [calendar.assigneeId, calendar]),
  );
  const releaseById = new Map(
    input.releases.map((release) => [release.id, release]),
  );
  const externalById = new Map(
    input.externalBlockers?.map((task) => [task.id, task]),
  );
  const blockers = new Map<string, Set<string>>();
  const successors = new Map<string, Set<string>>();
  for (const dependency of input.dependencies) {
    if (
      !taskById.has(dependency.blockedId) ||
      taskById.get(dependency.blockedId)?.state === "done"
    )
      continue;
    const blockedBy = blockers.get(dependency.blockedId) ?? new Set<string>();
    blockedBy.add(dependency.blockerId);
    blockers.set(dependency.blockedId, blockedBy);
    if (
      taskById.has(dependency.blockerId) &&
      taskById.get(dependency.blockerId)?.state !== "done"
    ) {
      const children =
        successors.get(dependency.blockerId) ?? new Set<string>();
      children.add(dependency.blockedId);
      successors.set(dependency.blockerId, children);
    }
  }
  const cycles = dependencyCycles(
    tasks.map((task) => task.id),
    successors,
  );
  const urgency = inheritedUrgency(tasks, blockers);
  const results = new Map<string, ScheduledTask>();
  for (const task of tasks) {
    results.set(task.id, {
      id: task.id,
      assigneeId: task.assigneeId,
      segments: [],
      start: null,
      end: null,
      reason: cycles.has(task.id)
        ? "dependency_cycle"
        : exclusion(task, calendarById.get(task.assigneeId ?? "")),
      warnings: [],
    });
  }
  const indegree = new Map(
    tasks.map((task) => [
      task.id,
      [...(blockers.get(task.id) ?? [])].filter(
        (id) =>
          taskById.has(id) &&
          taskById.get(id)?.state !== "done" &&
          !cycles.has(id),
      ).length,
    ]),
  );
  const compare = (a: PlanningTask, b: PlanningTask) =>
    urgency.get(a.id)! - urgency.get(b.id)! ||
    a.position - b.position ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const queue = new ReadyTaskQueue(compare);
  for (const task of tasks) {
    if (!cycles.has(task.id) && indegree.get(task.id) === 0) queue.push(task);
  }
  const reservations = new Map<string, TimeInterval[]>();
  for (const item of input.reservations ?? []) {
    const intervals = reservations.get(item.assigneeId) ?? [];
    intervals.push({
      start: Date.parse(item.start),
      end: Date.parse(item.end),
    });
    reservations.set(item.assigneeId, intervals);
  }
  for (const intervals of reservations.values())
    intervals.sort((a, b) => a.start - b.start);
  const calendarReaders = new Map(
    input.calendars.map((calendar) => [
      calendar.assigneeId,
      createCalendarReader(calendar),
    ]),
  );
  const allWarnings: ScheduleWarning[] = [];
  for (let task = queue.pop(); task; task = queue.pop()) {
    const result = results.get(task.id)!;
    let earliest = planFrom;
    if (!result.reason) {
      for (const blockerId of blockers.get(task.id) ?? []) {
        const blocker = taskById.get(blockerId);
        if (blocker?.state === "done") continue;
        if (blocker) {
          const blockerResult = results.get(blockerId)!;
          if (blockerResult.reason || !blockerResult.end) {
            result.reason = "blocked_dependency";
            break;
          }
          earliest = Math.max(earliest, Date.parse(blockerResult.end));
        } else {
          const external = externalById.get(blockerId);
          if (!external?.available) {
            result.reason = "external_dependency_unavailable";
            break;
          }
          if (external.state === "done") continue;
          if (external.state === "archived" || !external.appliedEnd) {
            result.reason = "external_dependency_unavailable";
            break;
          }
          earliest = Math.max(earliest, Date.parse(external.appliedEnd));
        }
      }
    }
    const release = releaseById.get(task.releaseId ?? "");
    if (!result.reason && release)
      earliest = Math.max(
        earliest,
        startOfLocalDay(release.startDate, input.timeZone),
      );
    if (!result.reason) {
      const occupied = reservations.get(task.assigneeId!) ?? [];
      const segments = fitWork(
        calendarReaders.get(task.assigneeId!)!,
        earliest,
        (task.estimateSeconds! - Math.max(0, task.loggedSeconds)) * 1000,
        occupied,
        horizon,
      );
      if (!segments) result.reason = "outside_planning_horizon";
      else {
        const start = segments[0]!.start;
        const end = segments.at(-1)!.end;
        result.segments = segments.map((segment) => ({
          start: new Date(segment.start).toISOString(),
          end: new Date(segment.end).toISOString(),
        }));
        result.start = new Date(start).toISOString();
        result.end = new Date(end).toISOString();
        occupied.push({ start, end });
        occupied.sort((a, b) => a.start - b.start);
        reservations.set(task.assigneeId!, occupied);
        if (release) {
          const finishDate = localDate(end - 1, input.timeZone);
          if (finishDate >= addDays(release.codeFreezeDate, 1))
            result.warnings.push({
              taskId: task.id,
              code: "after_code_freeze",
              releaseId: release.id,
            });
          if (finishDate >= addDays(release.submissionDate, 1))
            result.warnings.push({
              taskId: task.id,
              code: "after_submission",
              releaseId: release.id,
            });
          allWarnings.push(...result.warnings);
        }
      }
    }
    for (const child of successors.get(task.id) ?? []) {
      indegree.set(child, indegree.get(child)! - 1);
      if (indegree.get(child) === 0 && !cycles.has(child))
        queue.push(taskById.get(child)!);
    }
  }
  // Cycle members are not queued; their downstream work still receives a useful
  // blocked reason instead of being mistaken for a second dependency cycle.
  for (const result of results.values()) {
    if (!result.reason && !result.start) result.reason = "blocked_dependency";
  }
  return {
    asOf: input.asOf,
    planFrom: new Date(planFrom).toISOString(),
    tasks: [...results.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    ),
    warnings: allWarnings.sort(
      (a, b) =>
        a.taskId.localeCompare(b.taskId, "en") ||
        a.code.localeCompare(b.code, "en"),
    ),
  };
}
