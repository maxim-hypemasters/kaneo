import { readMemberHolidays } from "../time-off/holidays/read-member-holidays";
import type { ApprovedTimeOff } from "./approved-time-off-calendars";
import { coalesceDays } from "./coalesce-days";
import { addDays } from "./engine/zoned-time";
import type { PlanningTransaction } from "./read-input";

// The planner looks 3660 days past its start; two more days cover local
// dates on either side of the UTC one.
const HORIZON_DAYS = 3662;

// Calendar public holidays of planned assignees from `from` (a UTC day)
// through the planning horizon, consecutive days merged into one range.
// `revision` changes only when a calendar or the holiday data does, never as
// days pass; it is undefined without calendars, which keeps older plan
// digests.
export async function readPlanningHolidays(
  tx: PlanningTransaction,
  workspaceId: string,
  userIds: string[],
  from: string,
): Promise<{ ranges: ApprovedTimeOff[]; revision: string | undefined }> {
  const { byUser, revision } = await readMemberHolidays(
    tx,
    workspaceId,
    userIds,
    { from, to: addDays(from, HORIZON_DAYS) },
  );
  const ranges = [...byUser].flatMap(([userId, holidays]) =>
    coalesceDays(holidays.map(({ date }) => date)).map((range) => ({
      userId,
      ...range,
    })),
  );
  return { ranges, revision };
}
