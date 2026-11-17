import { describe, expect, it } from "vite-plus/test";
import type { TimeOffBalance } from "@/fetchers/time-off/types";
import { balanceRows } from "./balance-rows";

const figures = {
  allowanceDays: 25,
  allowanceSource: "default",
  usedDays: 0,
  pendingDays: 0,
  remainingDays: 25,
} as const;

function balance(userId: string): TimeOffBalance {
  return {
    workspaceId: "w1",
    userId,
    year: 2026,
    types: { vacation: figures, sick: figures, public_holiday: figures },
  };
}

const members = [
  { userId: "me", name: "Mia", image: null },
  { userId: "ana", name: "Ana Lee", image: "ana.png" },
  { userId: "bo", name: "Bo", image: null },
];

describe("balanceRows", () => {
  it("follows the member order and skips members without a balance", () => {
    const rows = balanceRows([balance("ana"), balance("me")], members);

    expect(rows.map((row) => row.member.userId)).toEqual(["me", "ana"]);
    expect(rows[1]?.member.image).toBe("ana.png");
    expect(rows[1]?.balance.userId).toBe("ana");
  });

  it("puts balances of unknown members last, without a name", () => {
    const rows = balanceRows([balance("gone"), balance("bo")], members);

    expect(rows.map((row) => row.member)).toEqual([
      { userId: "bo", name: "Bo", image: null },
      { userId: "gone", name: "", image: null },
    ]);
  });
});
