import { ApiError } from "../../errors/api-error";
import type { CheckedDay } from "./checked-days";

export const TASK_ASSIGNEE_AWAY = "TASK_ASSIGNEE_AWAY";

// What a task's conflicting dates say, start first.
function issueMessage(start?: string, due?: string) {
  if (start && due)
    return start === due
      ? `Starts and is due on ${start}, when the assignee is away`
      : `Starts on ${start} and is due on ${due}, when the assignee is away`;
  return start
    ? `Starts on ${start}, when the assignee is away`
    : `Due on ${due}, when the assignee is away`;
}

// One issue per task. The texts name dates only: never the kind of time off,
// its note or a holiday's name, which the caller may not be allowed to see.
export function taskAssigneeAwayError(conflicts: readonly CheckedDay[]) {
  const byTask = new Map<string, { start?: string; due?: string }>();
  for (const { taskId, field, day } of conflicts) {
    const dates = byTask.get(taskId) ?? {};
    if (field === "startDate") dates.start = day;
    else dates.due = day;
    byTask.set(taskId, dates);
  }
  const [only] = byTask.values();
  let message = `${byTask.size} tasks would start or be due on a day their assignee is away`;
  if (byTask.size === 1 && only) {
    const days = [...new Set([only.start, only.due].filter(Boolean))];
    const choice =
      only.start && only.due
        ? "other dates or another assignee"
        : `another ${only.start ? "start" : "due"} date or assignee`;
    message = `The assignee is away on ${days.join(" and ")}; choose ${choice}`;
  }
  return new ApiError(409, {
    code: TASK_ASSIGNEE_AWAY,
    message,
    issues: [...byTask].map(([taskId, dates]) => ({
      path: `tasks.${taskId}`,
      message: issueMessage(dates.start, dates.due),
    })),
  });
}
