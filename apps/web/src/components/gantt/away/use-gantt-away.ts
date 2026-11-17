import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAwayDays } from "@/hooks/queries/time-off/use-away-days";
import { formatReleaseDate, toReleaseDate } from "@/lib/releases/release-date";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import type {
  AwayRefusal,
  GanttBarAway,
  GanttTaskEdit,
  ScheduledTask,
} from "../gantt-types";
import type { GanttTimeline } from "../timeline";
import { type AwayRun, awayRunsByUser, NO_AWAY_RUNS } from "./away-runs";
import { blockedEditDay } from "./blocked-edit";

type Member = { id: string; name?: string | null };

const NO_RUNS_BY_USER: ReadonlyMap<string, readonly AwayRun[]> = new Map();

// Members' approved time off and public holidays on the Gantt: lane bands,
// marks on bars, drag hints and the check that keeps an edit the server
// would refuse from being sent. Loads nothing the viewer may not read.
export function useGanttAway(
  workspaceId: string,
  timeline: GanttTimeline | null,
  members: readonly Member[],
) {
  const { t } = useTranslation();
  const today = useReleaseToday();
  const from = timeline ? toReleaseDate(timeline.rangeStart) : null;
  const to = timeline ? toReleaseDate(timeline.rangeEnd) : null;
  const windows = useMemo(() => (from && to ? [{ from, to }] : []), [from, to]);
  const { byUser, isError, retry } = useAwayDays(workspaceId, windows);

  const rangeStart = timeline?.rangeStart;
  const dayCount = timeline?.days.length ?? 0;
  // Zooming changes neither, so it never recomputes the runs.
  const rangeStartTime = rangeStart?.getTime();
  const runsByUser = useMemo(
    () =>
      rangeStartTime === undefined
        ? NO_RUNS_BY_USER
        : awayRunsByUser(byUser, new Date(rangeStartTime), dayCount),
    [byUser, rangeStartTime, dayCount],
  );

  const nameOf = useCallback(
    (userId: string) =>
      members.find((member) => member.id === userId)?.name?.trim() ||
      t("common:people.unknown"),
    [members, t],
  );
  const refusal = useCallback(
    (task: ScheduledTask, edit: GanttTaskEdit): AwayRefusal | null => {
      const hit = blockedEditDay(task, edit, byUser);
      return hit
        ? {
            name: nameOf(hit.userId),
            date: formatReleaseDate(hit.date, { today }),
          }
        : null;
    },
    [byUser, nameOf, today],
  );
  const runsFor = useCallback(
    (userId: string | null | undefined) =>
      (userId && runsByUser.get(userId)) || NO_AWAY_RUNS,
    [runsByUser],
  );
  // Undefined for milestones, and while nobody is away (or the viewer may
  // not read time off), so bars render as before.
  const barFor = useCallback(
    (task: ScheduledTask): GanttBarAway | undefined => {
      if (task.entityKind === "milestone" || byUser.size === 0)
        return undefined;
      return {
        runs: runsFor(task.userId),
        name: task.userId ? nameOf(task.userId) : "",
        blockedHint: (edit) => {
          const refused = refusal(task, edit);
          return refused ? t("tasks:gantt.away.blockedHint", refused) : null;
        },
      };
    },
    [byUser, runsFor, nameOf, refusal, t],
  );

  return { runsFor, barFor, refusal, isError, retry };
}
