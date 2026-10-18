import { nextProgressDay } from "./progress-day";
import type {
  ProgressCounts,
  ProgressPoint,
  StatusChange,
  WorkflowChange,
} from "./types";

function groupDays<T extends { date: string }>(changes: readonly T[]) {
  const days = new Map<string, T[]>();
  for (const change of changes) {
    const items = days.get(change.date);
    if (items) items.push(change);
    else days.set(change.date, [change]);
  }
  return days;
}

function countProgress(
  statuses: ReadonlyMap<string, number>,
  columns: ReadonlyMap<string, WorkflowChange>,
): ProgressCounts {
  const ordered = [...columns.values()].sort(
    (left, right) =>
      left.position - right.position ||
      left.columnId.localeCompare(right.columnId),
  );
  const first = ordered.find((column) => !column.isFinal);
  const completed = new Set(
    ordered.filter((column) => column.isFinal).map((column) => column.slug),
  );
  const started = new Set(
    ordered
      .filter((column) => column.columnId !== first?.columnId)
      .map((column) => column.slug),
  );
  const counts = { scope: 0, started: 0, completed: 0 };
  for (const [status, count] of statuses) {
    counts.scope += count;
    if (completed.has(status)) {
      counts.completed += count;
      counts.started += count;
    } else if (
      status !== "planned" &&
      status !== "archived" &&
      started.has(status)
    ) {
      counts.started += count;
    }
  }
  return counts;
}

export function buildProgressSeries({
  startDate,
  submissionDate,
  trackingDay,
  today,
  statusChanges,
  workflowChanges,
}: {
  startDate: string;
  submissionDate: string;
  trackingDay: string;
  today: string;
  statusChanges: readonly StatusChange[];
  workflowChanges: readonly WorkflowChange[];
}) {
  const statuses = new Map<string, number>();
  const columns = new Map<string, WorkflowChange>();
  const statusDays = groupDays(statusChanges);
  const workflowDays = groupDays(workflowChanges);
  const dates = [...new Set([...statusDays.keys(), ...workflowDays.keys()])]
    .filter((date) => date <= today)
    .sort();
  const snapshots: ProgressPoint[] = [];
  for (const date of dates) {
    for (const change of statusDays.get(date) ?? []) {
      statuses.set(
        change.status,
        (statuses.get(change.status) ?? 0) + change.delta,
      );
    }
    // SQL supplies the last version of each column on a day. Id breaks ties
    // for callers which supply multiple versions (including pure tests).
    for (const change of (workflowDays.get(date) ?? []).sort(
      (a, b) => a.id - b.id,
    )) {
      if (change.present) columns.set(change.columnId, change);
      else columns.delete(change.columnId);
    }
    snapshots.push({ date, ...countProgress(statuses, columns) });
  }
  const current = countProgress(statuses, columns);
  const firstDay = startDate > trackingDay ? startDate : trackingDay;
  const points: ProgressPoint[] = [];
  let cursor = 0;
  let counts: ProgressCounts = { scope: 0, started: 0, completed: 0 };
  for (let date = firstDay; date <= today; date = nextProgressDay(date)) {
    while (snapshots[cursor] && snapshots[cursor]!.date <= date) {
      counts = snapshots[cursor]!;
      cursor += 1;
    }
    points.push({
      date,
      scope: counts.scope,
      started: counts.started,
      completed: counts.completed,
    });
  }
  // Past releases stop at submission or their last later change, without
  // stretching an unchanged chart to the present each time it is opened.
  while (points.length > 1) {
    const last = points.at(-1)!;
    const previous = points.at(-2)!;
    if (
      last.date <= submissionDate ||
      last.scope !== previous.scope ||
      last.started !== previous.started ||
      last.completed !== previous.completed
    )
      break;
    points.pop();
  }
  return { current, points };
}
