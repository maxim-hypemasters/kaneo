import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { timeOffTable } from "../database/schema";
import type { ApprovedTimeOff } from "./approved-time-off-calendars";
import type { PlanningTransaction } from "./read-input";

// Approved time off for planned assignees, who have already passed the
// membership and project-access checks. `ranges` holds what can still block
// work: ranges ending on or after `from` (a UTC day). `revision` fingerprints
// their planning keys, which change only with a schedule refresh (see
// time-off/planning-key.ts): never because time passes, and not for time off
// approved, edited or cancelled after it ended. It is undefined when there
// are no keys, which keeps the digest of plans made before time off.
export async function readApprovedTimeOff(
  tx: PlanningTransaction,
  workspaceId: string,
  userIds: string[],
  from: string,
): Promise<{ ranges: ApprovedTimeOff[]; revision: string | undefined }> {
  if (!userIds.length) return { ranges: [], revision: undefined };
  const assignees = and(
    eq(timeOffTable.workspaceId, workspaceId),
    sql`${timeOffTable.userId} = ANY(${sql.param(userIds)}::text[])`,
  );
  const ranges = await tx
    .select({
      userId: timeOffTable.userId,
      startDate: timeOffTable.startDate,
      endDate: timeOffTable.endDate,
    })
    .from(timeOffTable)
    .where(
      and(
        assignees,
        eq(timeOffTable.status, "approved"),
        gte(timeOffTable.endDate, from),
      ),
    )
    .orderBy(timeOffTable.userId, timeOffTable.startDate, timeOffTable.id);
  const [row] = await tx
    .select({
      revision: sql<
        string | null
      >`md5(string_agg(${timeOffTable.planningKey}, ',' order by ${timeOffTable.id}))`,
    })
    .from(timeOffTable)
    .where(and(assignees, isNotNull(timeOffTable.planningKey)));
  return { ranges, revision: row?.revision ?? undefined };
}
