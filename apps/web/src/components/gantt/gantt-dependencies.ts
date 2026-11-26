import { addDays, differenceInCalendarDays } from "date-fns";
import { lastScheduledInstant } from "./schedule-geometry";
import {
  dayColumn,
  nextWorkingDay,
  previousWorkingDay,
  shiftWorkingDays,
  spanLength,
} from "./weekend-columns";

// "A blocks B": B can't start before A ends.
export type GanttDependency = {
  id: string;
  blockerId: string;
  blockedId: string;
};

export type GanttSpan = {
  start: Date;
  end: Date;
  precise?: boolean;
  completed?: boolean;
};

export type GanttDependencyMove = {
  taskId: string;
  from: GanttSpan;
  to: GanttSpan;
};

type TaskRelation = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

// For "blocks" relations the source is the blocking task.
export function blockingDependencies(
  relations: readonly TaskRelation[],
): GanttDependency[] {
  return relations
    .filter(
      (relation) =>
        relation.relationType === "blocks" &&
        relation.sourceTaskId !== relation.targetTaskId,
    )
    .map((relation) => ({
      id: relation.id,
      blockerId: relation.sourceTaskId,
      blockedId: relation.targetTaskId,
    }));
}

// A blocked task may start on the day its blocker ends, but not before.
export function isDependencyBroken(blocker: GanttSpan, blocked: GanttSpan) {
  if (blocker.completed) return false;
  return blocker.precise || blocked.precise
    ? blocked.start.getTime() < blocker.end.getTime()
    : differenceInCalendarDays(blocked.start, blocker.end) < 0;
}

// With weekends hidden a span is drawn from the working day it starts on (or
// the next one) for `length` more columns. Planned work ends at an exclusive
// instant.
function drawnSpan(span: GanttSpan) {
  const end = span.precise
    ? lastScheduledInstant(span.start, span.end)
    : span.end;
  return {
    end,
    first: nextWorkingDay(span.start),
    length: spanLength(span.start, end, true),
  };
}

// `span` moved by whole columns. With weekends hidden it moves from the
// working days it is drawn on, so both ends land on working days and it keeps
// its working-day length, even when it moves no columns.
function shiftSpan(
  span: GanttSpan,
  columns: number,
  hideWeekends: boolean,
): GanttSpan {
  if (!hideWeekends) {
    return {
      ...span,
      start: addDays(span.start, columns),
      end: addDays(span.end, columns),
    };
  }
  const drawn = drawnSpan(span);
  const start = shiftWorkingDays(drawn.first, columns);
  const last = shiftWorkingDays(start, drawn.length);
  return {
    ...span,
    start,
    end: addDays(span.end, differenceInCalendarDays(last, drawn.end)),
  };
}

const DAY_MS = 86_400_000;

// How many days `blocked` starts before `blocker` ends (0 or less: in order).
// Planned work is timed to the minute, so any clash there takes a whole day
// to clear; finished blockers never hold anything up.
function overlapDays(blocker: GanttSpan, blocked: GanttSpan) {
  if (blocker.completed) return 0;
  if (blocker.precise || blocked.precise) {
    const overlap = blocker.end.getTime() - blocked.start.getTime();
    return overlap > 0 ? Math.ceil(overlap / DAY_MS) : 0;
  }
  return differenceInCalendarDays(blocker.end, blocked.start);
}

// How far `blocked` must move later (or `blocker` earlier, when `later` is
// false) to start no earlier than `blocker` ends; null when they are in order.
// With weekends hidden it counts working-day columns from where the mover is
// drawn. A clash between dates on hidden days can then take 0 columns: the
// move only lands the mover's dates on the working days it is drawn on.
function clearance(
  blocker: GanttSpan,
  blocked: GanttSpan,
  later: boolean,
  hideWeekends: boolean,
) {
  const days = overlapDays(blocker, blocked);
  if (days <= 0) return null;
  if (!hideWeekends) return days;
  if (later) {
    return dayColumn(addDays(blocked.start, days), blocked.start, true);
  }
  const drawn = drawnSpan(blocker);
  const latestEnd = previousWorkingDay(addDays(drawn.end, -days));
  return dayColumn(
    shiftWorkingDays(drawn.first, drawn.length),
    latestEnd,
    true,
  );
}

function groupBy(
  dependencies: readonly GanttDependency[],
  key: "blockerId" | "blockedId",
) {
  const groups = new Map<string, GanttDependency[]>();
  for (const dependency of dependencies) {
    const list = groups.get(dependency[key]) ?? [];
    list.push(dependency);
    groups.set(dependency[key], list);
  }
  return groups;
}

// What giving `taskId` the dates `next` does to its dependencies:
// - `broken`: dependencies of the task this edit breaks. One that was already
//   broken before doesn't count (so an old conflict doesn't prompt on every
//   unrelated reschedule), unless its id is in `heldBrokenIds`: those were
//   broken by this same edit when it was first held, and stay its conflicts
//   until fixed even if someone else's change since made them look old;
// - `moves`: how to fix them, keeping every duration: the tasks it blocks (and
//   the tasks those block) are pushed later, the tasks blocking it (and
//   theirs) pulled earlier. The edited task never moves, and only the
//   overlap a move adds is passed on, so older overlaps stay as they are;
// - `cycle`: the moves run into a loop of tasks blocking each other, so no
//   order satisfies them and `moves` is empty.
// Only tasks in `spans` (scheduled ones) take part. With `hideWeekends`,
// overlaps count working days and tasks move by whole working-day columns,
// like a dragged bar: their dates land on working days and each keeps its
// working-day length.
export function planDependencyMoves(
  spans: ReadonlyMap<string, GanttSpan>,
  dependencies: readonly GanttDependency[],
  taskId: string,
  next: GanttSpan,
  heldBrokenIds: ReadonlySet<string> = new Set(),
  hideWeekends = false,
) {
  // The edited task keeps what it is (planned, finished), only moved.
  const spanAfter = (id: string): GanttSpan | undefined =>
    id === taskId
      ? { ...spans.get(id), start: next.start, end: next.end }
      : spans.get(id);
  const broken = dependencies.filter((dependency) => {
    if (dependency.blockerId !== taskId && dependency.blockedId !== taskId) {
      return false;
    }
    const blocker = spanAfter(dependency.blockerId);
    const blocked = spanAfter(dependency.blockedId);
    const blockerBefore = spans.get(dependency.blockerId);
    const blockedBefore = spans.get(dependency.blockedId);
    if (!blocker || !blocked || !blockerBefore || !blockedBefore) return false;
    return (
      isDependencyBroken(blocker, blocked) &&
      (heldBrokenIds.has(dependency.id) ||
        !isDependencyBroken(blockerBefore, blockedBefore))
    );
  });
  const fixes = new Set(broken.map((dependency) => dependency.id));

  const moved = new Map<string, { span: GanttSpan; later: boolean }>();
  const current = (id: string) => moved.get(id)?.span ?? spanAfter(id);
  // Moving one task past another's dates at most once per task in between;
  // more than that means the moves are going round a loop.
  const maxMovesPerTask = spans.size;
  const moveCounts = new Map<string, number>();
  let cycle = false;

  // Pushes the tasks `id` blocks later (or pulls the ones blocking it
  // earlier) by however much they now overlap it. From the edited task that
  // is the whole overlap of the dependencies it broke; from a moved task,
  // only the overlap its move added.
  const spread = (startId: string, later: boolean) => {
    const byNeighbour = groupBy(
      dependencies,
      later ? "blockerId" : "blockedId",
    );
    const queue = [startId];
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      for (const dependency of byNeighbour.get(id) ?? []) {
        const otherId = later ? dependency.blockedId : dependency.blockerId;
        if (id === taskId && !fixes.has(dependency.id)) continue;
        const own = current(id);
        const other = current(otherId);
        if (!own || !other) continue;
        const now = later
          ? clearance(own, other, true, hideWeekends)
          : clearance(other, own, false, hideWeekends);
        const blockerBefore = spans.get(dependency.blockerId);
        const blockedBefore = spans.get(dependency.blockedId);
        const before =
          id !== taskId && blockerBefore && blockedBefore
            ? clearance(blockerBefore, blockedBefore, later, hideWeekends)
            : null;
        if (now === null || (before !== null && now <= before)) continue;
        const shift = now - (before ?? 0);
        const count = (moveCounts.get(otherId) ?? 0) + 1;
        const earlier = moved.get(otherId);
        if (
          otherId === taskId ||
          count > maxMovesPerTask ||
          (earlier && earlier.later !== later)
        ) {
          cycle = true;
          return;
        }
        moveCounts.set(otherId, count);
        moved.set(otherId, {
          span: shiftSpan(other, later ? shift : -shift, hideWeekends),
          later,
        });
        queue.push(otherId);
      }
    }
  };
  spread(taskId, true);
  if (!cycle) spread(taskId, false);
  if (cycle) return { broken, moves: [], cycle: true };

  const moves: GanttDependencyMove[] = [];
  for (const [id, { span: to }] of moved) {
    const from = spans.get(id);
    if (from) moves.push({ taskId: id, from, to });
  }
  return { broken, moves, cycle: false };
}
