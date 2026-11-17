import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { TimeOffTypeBalance as TypeBalance } from "@/fetchers/time-off/types";
import { TimeOffTypeBalance } from "./time-off-type-balance";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
  }),
}));

function figures(overrides: Partial<TypeBalance> = {}): TypeBalance {
  return {
    allowanceDays: 10,
    allowanceSource: "default",
    usedDays: 4,
    pendingDays: 2,
    remainingDays: 6,
    ...overrides,
  };
}

function renderItem(balance: TypeBalance) {
  render(
    <ul>
      <TimeOffTypeBalance type="sick" balance={balance} />
    </ul>,
  );
}

afterEach(cleanup);

describe("TimeOffTypeBalance", () => {
  it("shows the type's meter, pending and remaining days", () => {
    renderItem(figures());

    expect(screen.getByText("team:timeOff.types.sick")).toBeInTheDocument();
    expect(
      screen.getByRole("meter", {
        name: "team:timeOff.balance.meterLabel|team:timeOff.types.sick|4|10",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("team:timeOff.balance.usedOf|4|10"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("team:timeOff.balance.pendingCount|2"),
    ).toBeInTheDocument();
    expect(screen.getByText("team:timeOff.balance.left|6")).toBeInTheDocument();
    expect(
      screen.queryByText("team:timeOff.balance.override"),
    ).not.toBeInTheDocument();
  });

  it("shows how far over the allowance it is", () => {
    renderItem(figures({ usedDays: 13, remainingDays: -3 }));

    const over = screen.getByText("team:timeOff.balance.over|3");
    expect(over.className).toContain("text-destructive-foreground");
    expect(
      screen.queryByText(/team:timeOff\.balance\.left/),
    ).not.toBeInTheDocument();
  });

  it("notes an allowance set individually", () => {
    renderItem(figures({ allowanceSource: "override", allowanceDays: 12 }));

    expect(
      screen.getByText("team:timeOff.balance.override"),
    ).toBeInTheDocument();
  });
});
