import { describe, expect, it } from "vite-plus/test";
import { projectBalance, projectBalances } from "./project-balance";

const balance = {
  year: 2026,
  allowanceDays: 25,
  usedDays: 10,
  pendingDays: 5,
};

function typed(
  year: number,
  vacation: { usedDays: number; pendingDays: number },
  sick = { usedDays: 0, pendingDays: 0 },
) {
  return {
    year,
    types: {
      vacation: { allowanceDays: 25, ...vacation },
      sick: { allowanceDays: 10, ...sick },
      public_holiday: { allowanceDays: 10, usedDays: 0, pendingDays: 0 },
    },
  };
}

describe("projectBalance", () => {
  it("subtracts used, pending and draft days", () => {
    expect(projectBalance(balance, 4)).toEqual({
      year: 2026,
      allowanceDays: 25,
      draftDays: 4,
      remainingAfter: 6,
      overBy: 0,
    });
  });

  it("reports how far a draft goes over", () => {
    expect(projectBalance(balance, 13)).toMatchObject({
      remainingAfter: -3,
      overBy: 3,
    });
  });

  it("does not count an edited pending request twice", () => {
    const original = {
      status: "pending" as const,
      daysByYear: [{ year: 2026, days: 5 }],
    };
    expect(projectBalance(balance, 5, original).remainingAfter).toBe(10);
  });

  it("takes an edited approved request off the used days", () => {
    const original = {
      status: "approved" as const,
      daysByYear: [{ year: 2026, days: 4 }],
    };
    expect(projectBalance(balance, 2, original).remainingAfter).toBe(12);
  });
});

describe("projectBalances", () => {
  it("projects each year the draft touches and skips unloaded ones", () => {
    expect(
      projectBalances(
        [
          typed(2026, { usedDays: 10, pendingDays: 5 }),
          typed(2027, { usedDays: 0, pendingDays: 0 }),
        ],
        "vacation",
        [
          { year: 2026, days: 4 },
          { year: 2027, days: 6 },
          { year: 2028, days: 1 },
        ],
      ).map(({ year, remainingAfter }) => [year, remainingAfter]),
    ).toEqual([
      [2026, 6],
      [2027, 19],
    ]);
  });

  it("projects against the draft type's own allowance", () => {
    const balances = [
      typed(
        2026,
        { usedDays: 20, pendingDays: 0 },
        { usedDays: 2, pendingDays: 1 },
      ),
    ];
    expect(
      projectBalances(balances, "sick", [{ year: 2026, days: 3 }]),
    ).toEqual([
      {
        year: 2026,
        allowanceDays: 10,
        draftDays: 3,
        remainingAfter: 4,
        overBy: 0,
      },
    ]);
  });

  it("subtracts an original of the same type", () => {
    const balances = [typed(2026, { usedDays: 10, pendingDays: 5 })];
    const original = {
      type: "vacation" as const,
      status: "pending" as const,
      daysByYear: [{ year: 2026, days: 5 }],
    };
    expect(
      projectBalances(
        balances,
        "vacation",
        [{ year: 2026, days: 5 }],
        original,
      )[0]?.remainingAfter,
    ).toBe(10);
  });

  it("leaves an original of another type out", () => {
    const balances = [
      typed(
        2026,
        { usedDays: 10, pendingDays: 5 },
        { usedDays: 0, pendingDays: 0 },
      ),
    ];
    const original = {
      type: "vacation" as const,
      status: "pending" as const,
      daysByYear: [{ year: 2026, days: 5 }],
    };
    // Editing a vacation into sick days: the sick balance never held them.
    expect(
      projectBalances(balances, "sick", [{ year: 2026, days: 5 }], original)[0]
        ?.remainingAfter,
    ).toBe(5);
  });
});
