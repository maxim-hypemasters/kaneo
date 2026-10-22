import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  projectWorkflowHistoryTable,
  releaseProgressEventTable,
  releaseTable,
} from "../../database/schema";
import { boundedTaskRead } from "../../task/bounded-read";
import { buildProgressSeries } from "./build-progress-series";
import { progressDay } from "./progress-day";

export function readReleaseProgress(id: string, timeZone: string) {
  // ICU accepts aliases such as PST as a regional zone, while PostgreSQL may
  // interpret the same spelling as a fixed offset. Use ICU's canonical name
  // for both bucketing and today's date so DST boundaries agree.
  const canonicalTimeZone = new Intl.DateTimeFormat("en-US", {
    timeZone,
  }).resolvedOptions().timeZone;
  return boundedTaskRead(async (tx) => {
    const now = new Date();
    const [release] = await tx
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.id, id));
    if (!release)
      throw new HTTPException(404, { message: "Release not found" });
    const today = progressDay(now, canonicalTimeZone);
    const startBoundary = sql`(${release.startDate}::date::timestamp at time zone ${canonicalTimeZone})`;
    const [baseline] = await tx
      .select({
        recordedAt: releaseProgressEventTable.recordedAt,
        coversStart: sql<boolean>`${releaseProgressEventTable.recordedAt} < ${startBoundary}`,
      })
      .from(releaseProgressEventTable)
      .where(
        and(
          eq(releaseProgressEventTable.releaseId, id),
          isNull(releaseProgressEventTable.status),
        ),
      );
    if (!baseline)
      throw new HTTPException(503, {
        message: "Release progress history is not available; retry later",
      });

    let startScope: number | null = null;
    if (release.startDate <= today && baseline.coversStart) {
      const [startingCounts] = await tx
        .select({
          scope:
            sql<number>`coalesce(sum(${releaseProgressEventTable.delta}), 0)`.mapWith(
              Number,
            ),
        })
        .from(releaseProgressEventTable)
        .where(
          and(
            eq(releaseProgressEventTable.releaseId, id),
            isNotNull(releaseProgressEventTable.status),
            lt(releaseProgressEventTable.recordedAt, startBoundary),
          ),
        );
      startScope = startingCounts?.scope ?? 0;
    }

    const eventDay = sql<string>`to_char(${releaseProgressEventTable.recordedAt} at time zone ${canonicalTimeZone}, 'YYYY-MM-DD')`;
    const statusChanges = await tx
      .select({
        date: eventDay,
        status: sql<string>`${releaseProgressEventTable.status}`,
        delta: sql<number>`sum(${releaseProgressEventTable.delta})`.mapWith(
          Number,
        ),
      })
      .from(releaseProgressEventTable)
      .where(
        and(
          eq(releaseProgressEventTable.releaseId, id),
          isNotNull(releaseProgressEventTable.status),
          lte(releaseProgressEventTable.recordedAt, now),
        ),
      )
      // A repeated parameterized timezone expression gets a different bind
      // index, which PostgreSQL treats as a different grouping expression.
      .groupBy(sql`1`, releaseProgressEventTable.status);

    const versions = tx
      .select({
        ...getTableColumns(projectWorkflowHistoryTable),
        date: sql<string>`to_char(${projectWorkflowHistoryTable.recordedAt} at time zone ${canonicalTimeZone}, 'YYYY-MM-DD')`.as(
          "day",
        ),
      })
      .from(projectWorkflowHistoryTable)
      .where(
        and(
          eq(projectWorkflowHistoryTable.projectId, release.projectId),
          lte(projectWorkflowHistoryTable.recordedAt, now),
        ),
      )
      .as("workflow_versions");
    const workflowChanges = await tx
      .selectDistinctOn([versions.columnId, versions.date], {
        id: versions.id,
        date: versions.date,
        columnId: versions.columnId,
        slug: versions.slug,
        position: versions.position,
        isFinal: versions.isFinal,
        present: versions.present,
      })
      .from(versions)
      .orderBy(
        asc(versions.columnId),
        asc(versions.date),
        desc(versions.recordedAt),
        desc(versions.id),
      );

    return {
      trackedFrom: baseline.recordedAt.toISOString(),
      today,
      startScope,
      ...buildProgressSeries({
        ...release,
        trackingDay: progressDay(baseline.recordedAt, canonicalTimeZone),
        today,
        statusChanges,
        workflowChanges,
      }),
    };
  }, "Release progress request took too long; retry later");
}
