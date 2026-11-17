import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  timeOffAllowanceTable,
  timeOffPolicyTable,
  timeOffTable,
} from "../database/schema";
import type { Reader } from "./access";
import { DEFAULT_ALLOWANCE_DAYS } from "./constants";
import { NO_HOLIDAYS } from "./count-workdays";
import type { HolidayDays } from "./holidays/holiday-days";
import { readHolidayDays } from "./holidays/read-holiday-days";
import {
  type BalanceRange,
  summarizeBalance,
  type TimeOffBalance,
} from "./summarize-balance";
import type { TimeOffType } from "./time-off-kinds";

// The workspace default of every type: its policy row, or
// DEFAULT_ALLOWANCE_DAYS for a type without one.
export async function readDefaultAllowances(
  database: Reader,
  workspaceId: string,
): Promise<Record<TimeOffType, number>> {
  const policies = await database
    .select({
      type: timeOffPolicyTable.type,
      days: timeOffPolicyTable.defaultAllowanceDays,
    })
    .from(timeOffPolicyTable)
    .where(eq(timeOffPolicyTable.workspaceId, workspaceId));
  const defaults: Record<TimeOffType, number> = { ...DEFAULT_ALLOWANCE_DAYS };
  for (const policy of policies) defaults[policy.type] = policy.days;
  return defaults;
}

// Each member's balance for each year, members in the order given and years
// within them. Callers pass distinct user ids of current members. A caller
// that already read holidays may pass them; they must cover every year
// given in full (readHolidayDays does), because public_holiday counts every
// weekday holiday of the year.
export async function readTimeOffBalances(
  database: Reader,
  workspaceId: string,
  userIds: readonly string[],
  years: readonly number[],
  yearHolidays?: HolidayDays,
): Promise<TimeOffBalance[]> {
  if (userIds.length === 0 || years.length === 0) return [];
  const defaults = await readDefaultAllowances(database, workspaceId);
  const overrides = await database
    .select({
      userId: timeOffAllowanceTable.userId,
      type: timeOffAllowanceTable.type,
      days: timeOffAllowanceTable.days,
    })
    .from(timeOffAllowanceTable)
    .where(
      and(
        eq(timeOffAllowanceTable.workspaceId, workspaceId),
        inArray(timeOffAllowanceTable.userId, [...userIds]),
      ),
    );
  const ranges = await database
    .select({
      userId: timeOffTable.userId,
      type: timeOffTable.type,
      startDate: timeOffTable.startDate,
      endDate: timeOffTable.endDate,
      status: timeOffTable.status,
    })
    .from(timeOffTable)
    .where(
      and(
        eq(timeOffTable.workspaceId, workspaceId),
        inArray(timeOffTable.userId, [...userIds]),
        inArray(timeOffTable.status, ["pending", "approved"]),
        lte(timeOffTable.startDate, `${Math.max(...years)}-12-31`),
        gte(timeOffTable.endDate, `${Math.min(...years)}-01-01`),
      ),
    );
  const holidays =
    yearHolidays ??
    (await readHolidayDays(database, workspaceId, userIds, years));

  const overridesByUser = new Map<
    string,
    Partial<Record<TimeOffType, number>>
  >();
  for (const { userId, type, days } of overrides) {
    overridesByUser.set(userId, {
      ...overridesByUser.get(userId),
      [type]: days,
    });
  }
  const rangesByUser = new Map<string, BalanceRange[]>();
  for (const { userId, ...range } of ranges) {
    rangesByUser.set(userId, [...(rangesByUser.get(userId) ?? []), range]);
  }
  return userIds.flatMap((userId) =>
    years.map((year) =>
      summarizeBalance(
        {
          workspaceId,
          userId,
          year,
          defaults,
          overrides: overridesByUser.get(userId) ?? {},
        },
        rangesByUser.get(userId) ?? [],
        holidays.get(userId) ?? NO_HOLIDAYS,
      ),
    ),
  );
}
