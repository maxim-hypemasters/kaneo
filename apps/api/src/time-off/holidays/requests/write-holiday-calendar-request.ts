import { eq } from "drizzle-orm";
import { timeOffHolidayCalendarRequestTable } from "../../../database/schema";
import type { TimeOffTransaction } from "../../access";
import type { TimeOffStatus } from "../../time-off-kinds";
import type { HolidayCalendarCode } from "../catalog";
import type { HolidayCalendarChoicePlan } from "../plan-holiday-calendar-choice";
import type { HolidayCalendarRequestRow } from "./present-holiday-calendar-request";

export type HolidayCalendarRequestWrite = {
  // The member's pending request after the write, or null.
  pending: HolidayCalendarRequestRow | null;
  // The row that changed and its status before, for the change event.
  changed: {
    row: HolidayCalendarRequestRow;
    previousStatus: TimeOffStatus | null;
  } | null;
};

// Carries out a choice plan's request step. Call under the member lock, so
// `pending` is still the member's pending request.
export async function writeHolidayCalendarRequest(
  tx: TimeOffTransaction,
  input: {
    workspaceId: string;
    userId: string;
    actorId: string;
    pending: HolidayCalendarRequestRow | null;
    action: HolidayCalendarChoicePlan["request"];
    target: HolidayCalendarCode | null;
  },
): Promise<HolidayCalendarRequestWrite> {
  const { workspaceId, userId, actorId, pending, action, target } = input;
  const values = {
    country: target?.country ?? null,
    region: target?.region ?? null,
  };
  if (action === "create") {
    const [row] = await tx
      .insert(timeOffHolidayCalendarRequestTable)
      .values({ workspaceId, userId, ...values })
      .returning();
    return { pending: row!, changed: { row: row!, previousStatus: null } };
  }
  if (!pending || action === "none" || action === "keep")
    return { pending, changed: null };
  const [row] = await tx
    .update(timeOffHolidayCalendarRequestTable)
    .set(
      action === "update"
        ? { ...values, version: pending.version + 1, updatedAt: new Date() }
        : {
            status: action === "approve" ? "approved" : "cancelled",
            statusChangedBy: actorId,
            statusChangedAt: new Date(),
          },
    )
    .where(eq(timeOffHolidayCalendarRequestTable.id, pending.id))
    .returning();
  return {
    pending: action === "update" ? row! : null,
    changed: { row: row!, previousStatus: pending.status },
  };
}
