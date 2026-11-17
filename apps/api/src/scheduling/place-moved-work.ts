import type { TimeOffTransaction } from "../time-off/access";
import { readBlockedDays } from "../time-off/read-blocked-days";
import { addDays, localDate } from "./engine/zoned-time";
import {
  MOVE_HORIZON_DAYS,
  movePlacement,
  type TaskPlacement,
} from "./move-placement";

// Where moved work lands. Planned work is laid out again around its planned
// assignee's days away (approved time off and public holidays), as Apply
// plans it, so its own dates never need the task date check. Hand-set spans
// and unplanned work take the target as given; the caller checks those.
export async function placeMovedWork(
  tx: TimeOffTransaction,
  task: TaskPlacement & { scheduledAssigneeId: string | null },
  target: { start: Date; end: Date },
  project: { workspaceId: string; timeZone: string },
  exact: boolean,
): Promise<TaskPlacement | null> {
  const assigneeId = task.scheduledAssigneeId;
  if (exact || !task.scheduleSegments?.length || !assigneeId)
    return movePlacement(task, target, project.timeZone, exact);
  // The whole horizon, with a day either side for local days around it.
  const from = addDays(localDate(target.start.getTime(), project.timeZone), -1);
  const blocked = await readBlockedDays(tx, project.workspaceId, [assigneeId], {
    from,
    to: addDays(from, MOVE_HORIZON_DAYS + 2),
  });
  return movePlacement(
    task,
    target,
    project.timeZone,
    false,
    blocked.get(assigneeId) ?? [],
  );
}
