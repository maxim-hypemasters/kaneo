import { eq } from "drizzle-orm";
import { timeOffSettingTable } from "../../database/schema";
import type { Reader } from "../access";

// The last UTC day of free first calendar choices, or null without a
// deadline.
export async function readHolidayCalendarDeadline(
  reader: Reader,
  workspaceId: string,
): Promise<string | null> {
  const [row] = await reader
    .select({ deadline: timeOffSettingTable.holidayCalendarDeadline })
    .from(timeOffSettingTable)
    .where(eq(timeOffSettingTable.workspaceId, workspaceId));
  return row?.deadline ?? null;
}
