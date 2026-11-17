import type { TimeOffType } from "@/fetchers/time-off/types";
import type { YearDays } from "./workdays-by-year";

// One type's figures in one year.
export type BalanceFigures = {
  year: number;
  allowanceDays: number;
  usedDays: number;
  pendingDays: number;
};

// A year's balance with figures for every type, as the API returns it.
export type TypedBalance = {
  year: number;
  types: Record<TimeOffType, Omit<BalanceFigures, "year">>;
};

// The request being edited: its days are already in its type's balance, as
// used days when approved and as pending days otherwise.
export type OriginalRequest = {
  type: TimeOffType;
  status: "pending" | "approved";
  daysByYear: readonly YearDays[];
};

export type BalanceProjection = {
  year: number;
  allowanceDays: number;
  draftDays: number;
  // What would be left once the draft and every other pending request are
  // approved. Negative when over.
  remainingAfter: number;
  overBy: number;
};

function daysIn(days: readonly YearDays[] | undefined, year: number) {
  return days?.find((entry) => entry.year === year)?.days ?? 0;
}

// remaining(Y) = allowance(Y) - used(Y) - (pending(Y) - original(Y)) - draft(Y)
// The original request's days come off whichever total holds them, so an
// edit is not counted twice.
export function projectBalance(
  balance: BalanceFigures,
  draftDays: number,
  original?: Omit<OriginalRequest, "type">,
): BalanceProjection {
  const originalDays = daysIn(original?.daysByYear, balance.year);
  const used =
    balance.usedDays - (original?.status === "approved" ? originalDays : 0);
  const pending =
    balance.pendingDays - (original?.status === "pending" ? originalDays : 0);
  const remainingAfter = balance.allowanceDays - used - pending - draftDays;
  return {
    year: balance.year,
    allowanceDays: balance.allowanceDays,
    draftDays,
    remainingAfter,
    overBy: Math.max(0, -remainingAfter),
  };
}

// One projection per year the draft costs days in, against the draft type's
// allowance. An original of another type holds no days in that balance, so
// nothing comes off. Years whose balance has not loaded yet are left out.
export function projectBalances(
  balances: readonly TypedBalance[],
  type: TimeOffType,
  draft: readonly YearDays[],
  original?: OriginalRequest,
): BalanceProjection[] {
  const sameType = original?.type === type ? original : undefined;
  return draft.flatMap(({ year, days }) => {
    const balance = balances.find((candidate) => candidate.year === year);
    return balance
      ? [projectBalance({ year, ...balance.types[type] }, days, sameType)]
      : [];
  });
}
