import type { TimeOffBalance } from "@/fetchers/time-off/types";
import type { TimelineMember } from "../timeline/timeline-members";

export type BalanceRow = {
  balance: TimeOffBalance;
  member: TimelineMember;
};

// One row per balance, in the members' order (the viewer first, then by
// name). A balance for someone missing from the member list goes last,
// without a name.
export function balanceRows(
  balances: readonly TimeOffBalance[],
  members: readonly TimelineMember[],
): BalanceRow[] {
  const byUser = new Map(balances.map((balance) => [balance.userId, balance]));
  const rows: BalanceRow[] = [];
  for (const member of members) {
    const balance = byUser.get(member.userId);
    if (!balance) continue;
    rows.push({ balance, member });
    byUser.delete(member.userId);
  }
  for (const balance of byUser.values()) {
    rows.push({
      balance,
      member: { userId: balance.userId, name: "", image: null },
    });
  }
  return rows;
}
