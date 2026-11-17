import { and, eq, exists, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import db from "../database";
import { timeOffTable, workspaceUserTable } from "../database/schema";
import type { DayRange } from "./day-range";
import type { TimeOffRow } from "./present-time-off";
import {
  memberNotFound,
  timeOffNotFound,
  timeOffOverlapError,
} from "./time-off-errors";

export type TimeOffTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type Reader = Pick<typeof db, "select">;

type MemberColumns = { workspaceId: AnyPgColumn; userId: AnyPgColumn };

// Keeps rows of people who are still members. workspace_member has no unique
// (workspace_id, user_id), so this is a semi-join: a duplicate membership row
// never repeats a row. Inside a transaction pass `tx` as the reader, so the
// subquery is built there and never reaches for a second pool connection.
export function heldByCurrentMember(
  columns: MemberColumns = timeOffTable,
  reader: Reader = db,
) {
  return exists(
    reader
      .select({ one: sql`1` })
      .from(workspaceUserTable)
      .where(
        and(
          eq(workspaceUserTable.workspaceId, columns.workspaceId),
          eq(workspaceUserTable.userId, columns.userId),
        ),
      ),
  );
}

// Serializes creates and edits of one member's time off, so the overlap check
// and the write see the same rows. Member removal takes it too.
export async function lockTimeOffMember(
  tx: TimeOffTransaction,
  workspaceId: string,
  userId: string,
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`time-off:${workspaceId}:${userId}`}, 0))`,
  );
}

export async function findTimeOff(
  tx: Reader,
  workspaceId: string,
  id: string,
  lock = false,
): Promise<TimeOffRow> {
  const query = tx
    .select()
    .from(timeOffTable)
    .where(
      and(
        eq(timeOffTable.id, id),
        eq(timeOffTable.workspaceId, workspaceId),
        heldByCurrentMember(),
      ),
    );
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw timeOffNotFound();
  return row;
}

export async function isWorkspaceMember(
  database: Reader,
  workspaceId: string,
  userId: string,
) {
  const [member] = await database
    .select({ one: sql`1` })
    .from(workspaceUserTable)
    .where(
      and(
        eq(workspaceUserTable.workspaceId, workspaceId),
        eq(workspaceUserTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(member);
}

export async function assertWorkspaceMember(
  database: Reader,
  workspaceId: string,
  userId: string,
) {
  if (!(await isWorkspaceMember(database, workspaceId, userId)))
    throw memberNotFound();
}

// Ranges are inclusive, so sharing a boundary day overlaps. Declined and
// cancelled requests never block.
export async function assertNoOverlap(
  tx: Reader,
  workspaceId: string,
  userId: string,
  range: DayRange,
  excludeId?: string,
) {
  const [clash] = await tx
    .select({ id: timeOffTable.id })
    .from(timeOffTable)
    .where(
      and(
        eq(timeOffTable.workspaceId, workspaceId),
        eq(timeOffTable.userId, userId),
        inArray(timeOffTable.status, ["pending", "approved"]),
        lte(timeOffTable.startDate, range.endDate),
        gte(timeOffTable.endDate, range.startDate),
        excludeId ? ne(timeOffTable.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  if (clash) throw timeOffOverlapError();
}
