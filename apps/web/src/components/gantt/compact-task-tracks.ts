import { startOfDay } from "date-fns";
import type { ScheduledTask } from "./gantt-types";
import { lastScheduledInstant } from "./schedule-geometry";

// Where each task sat in the last layout, and the days it covered then.
export type CompactTrackMemory = ReadonlyMap<
  string,
  { track: number; firstDay: number; lastDay: number }
>;

type Track = { tasks: ScheduledTask[]; days: [number, number][] };

// The last calendar day the task's bar covers. Planned work ends at an
// exclusive instant; other bars end on a day.
function lastBarDay(task: ScheduledTask) {
  const plannedWork = task.entityKind !== "milestone" && task.scheduleApplied;
  return startOfDay(
    plannedWork
      ? lastScheduledInstant(task.scheduleStart, task.scheduleEnd)
      : task.scheduleEnd,
  ).getTime();
}

function barDays(task: ScheduledTask): [number, number] {
  return [startOfDay(task.scheduleStart).getTime(), lastBarDay(task)];
}

// Compact rows: tasks whose bars cover no common day share a track. Packing
// ignores the rendered range, so tracks hold still while the range grows.
//
// Given the last layout, tracks hold still while bars are moved or resized
// too: every task stays on its track, and one whose new days collide there
// moves to the first track with room, leaving the bars it hit in place. New
// tasks take the first track with room.
export function compactTaskTracks(
  tasks: readonly ScheduledTask[],
  isMobile: boolean,
  previous?: CompactTrackMemory,
): ScheduledTask[][] {
  const sorted = [...tasks].sort(
    (left, right) =>
      left.scheduleStart.getTime() - right.scheduleStart.getTime() ||
      left.scheduleEnd.getTime() - right.scheduleEnd.getTime() ||
      left.id.localeCompare(right.id),
  );
  const tracks: Track[] = [];
  const trackAt = (index: number) => {
    while (tracks.length <= index) tracks.push({ tasks: [], days: [] });
    return tracks[index]!;
  };
  // Phone labels may extend beyond short bars. Give each its own track.
  const fits = (track: Track, [first, last]: [number, number]) =>
    isMobile
      ? track.tasks.length === 0
      : track.days.every(([taken, until]) => until < first || last < taken);
  const place = (task: ScheduledTask, track: Track, days: [number, number]) => {
    track.tasks.push(task);
    track.days.push(days);
  };
  const placeFirstFree = (task: ScheduledTask, days: [number, number]) =>
    place(
      task,
      tracks.find((track) => fits(track, days)) ?? trackAt(tracks.length),
      days,
    );

  // Bars that kept their days can't collide on their old tracks, so they
  // go first; then edited bars, then new ones.
  const edited: ScheduledTask[] = [];
  const added: ScheduledTask[] = [];
  for (const task of sorted) {
    const before = previous?.get(task.id);
    const days = barDays(task);
    if (!before) added.push(task);
    else if (before.firstDay === days[0] && before.lastDay === days[1])
      place(task, trackAt(before.track), days);
    else edited.push(task);
  }
  for (const task of edited) {
    const days = barDays(task);
    const own = trackAt(previous!.get(task.id)!.track);
    if (fits(own, days)) place(task, own, days);
    else placeFirstFree(task, days);
  }
  for (const task of added) placeFirstFree(task, barDays(task));

  // A track left empty (its tasks moved lane, or are filtered out) closes up.
  return tracks
    .filter((track) => track.tasks.length > 0)
    .map((track) =>
      track.tasks.sort(
        (left, right) =>
          left.scheduleStart.getTime() - right.scheduleStart.getTime(),
      ),
    );
}

export function rememberTracks(
  tracks: readonly (readonly ScheduledTask[])[],
): CompactTrackMemory {
  const memory = new Map<
    string,
    { track: number; firstDay: number; lastDay: number }
  >();
  tracks.forEach((tasks, track) => {
    for (const task of tasks) {
      const [firstDay, lastDay] = barDays(task);
      memory.set(task.id, { track, firstDay, lastDay });
    }
  });
  return memory;
}
