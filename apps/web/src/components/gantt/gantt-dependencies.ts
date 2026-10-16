import { addDays, differenceInCalendarDays } from "date-fns";

// "A blocks B": B can't start before A ends.
export type GanttDependency = {
  id: string;
  blockerId: string;
  blockedId: string;
};

export type GanttSpan = { start: Date; end: Date };

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
  return differenceInCalendarDays(blocked.start, blocker.end) < 0;
}

function shiftSpan(span: GanttSpan, days: number): GanttSpan {
  return { start: addDays(span.start, days), end: addDays(span.end, days) };
}

// How many days `blocked` starts before `blocker` ends (0 or less: in order).
function overlapDays(blocker: GanttSpan, blocked: GanttSpan) {
  return differenceInCalendarDays(blocker.end, blocked.start);
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
// Only tasks in `spans` (scheduled ones) take part.
export function planDependencyMoves(
  spans: ReadonlyMap<string, GanttSpan>,
  dependencies: readonly GanttDependency[],
  taskId: string,
  next: GanttSpan,
  heldBrokenIds: ReadonlySet<string> = new Set(),
) {
  const spanAfter = (id: string) => (id === taskId ? next : spans.get(id));
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
        const now = later ? overlapDays(own, other) : overlapDays(other, own);
        let shift = now;
        if (id !== taskId) {
          const blockerBefore = spans.get(dependency.blockerId);
          const blockedBefore = spans.get(dependency.blockedId);
          if (blockerBefore && blockedBefore) {
            shift -= Math.max(0, overlapDays(blockerBefore, blockedBefore));
          }
        }
        if (shift <= 0) continue;
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
          span: shiftSpan(other, later ? shift : -shift),
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
