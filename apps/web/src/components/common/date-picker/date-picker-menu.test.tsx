import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { BlockedDays } from "./blocked-days";
import { DatePickerMenu } from "./date-picker-menu";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: { date?: string }) =>
      options?.date ? `${key} ${options.date}` : key,
  }),
}));

afterEach(cleanup);

const bounds = {
  before: new Date(2030, 0, 10),
  after: new Date(2030, 0, 20),
};

function renderMenu(props: Partial<Parameters<typeof DatePickerMenu>[0]>) {
  render(
    <DatePickerMenu
      label="Code freeze"
      placeholder="Set date…"
      clearLabel="Clear"
      value={null}
      onChange={vi.fn()}
      bounds={bounds}
      {...props}
    />,
  );
  return screen.getByPlaceholderText("Set date…");
}

describe("DatePickerMenu", () => {
  it("keeps its own wording for a typed day out of range", () => {
    const input = renderMenu({});

    fireEvent.change(input, { target: { value: "2030-01-05" } });

    expect(
      screen.getByText(/^tasks:datePicker\.beforeStart /),
    ).toBeInTheDocument();
  });

  it("words a typed day out of range by side when asked", () => {
    const outOfRangeLabel = vi.fn(
      (side: "before" | "after", date: string) => `${side}: ${date}`,
    );
    const input = renderMenu({ outOfRangeLabel });

    fireEvent.change(input, { target: { value: "2030-01-25" } });

    expect(screen.getByText(/^after: /)).toBeInTheDocument();
    expect(outOfRangeLabel).toHaveBeenLastCalledWith(
      "after",
      expect.any(String),
    );

    fireEvent.change(input, { target: { value: "2030-01-05" } });

    expect(screen.getByText(/^before: /)).toBeInTheDocument();
  });

  it("shows a given limit hint instead of the formatted one", () => {
    renderMenu({
      formatLimit: (date) => `Due ${date}`,
      limitHint: "Between Jan 10 and Jan 20",
    });

    expect(screen.getByText("Between Jan 10 and Jan 20")).toBeInTheDocument();
    expect(screen.queryByText(/^Due /)).toBeNull();
  });

  it("still formats the limit without a given hint", () => {
    renderMenu({ formatLimit: (date) => `Due ${date}` });

    expect(screen.getByText(/^Due /)).toBeInTheDocument();
  });

  describe("with days that can't be picked", () => {
    // Mon Jan 14, 2030; the assignee is away on Jan 15 and 16.
    const blocked = new Set([15, 16]);
    const blockedDays = (onMonthChange = vi.fn()): BlockedDays => ({
      isBlocked: (day) =>
        day.getFullYear() === 2030 &&
        day.getMonth() === 0 &&
        blocked.has(day.getDate()),
      describe: (day) => `Ann is away on Jan ${day.getDate()}`,
      hint: "Struck-through days: Ann is away",
      onMonthChange,
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("leaves them out of the quick dates and explains them", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2030, 0, 14));
      renderMenu({ blockedDays: blockedDays() });

      expect(screen.getByText("tasks:due.today")).toBeInTheDocument();
      expect(screen.queryByText("tasks:due.tomorrow")).toBeNull();
      expect(
        screen.getByText("Struck-through days: Ann is away"),
      ).toBeInTheDocument();
    });

    it("says why a typed day can't be picked, and doesn't offer it", () => {
      const onChange = vi.fn();
      const input = renderMenu({ blockedDays: blockedDays(), onChange });

      fireEvent.change(input, { target: { value: "2030-01-16" } });

      expect(screen.getByText("Ann is away on Jan 16")).toBeInTheDocument();
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("disables and strikes them through in the month", () => {
      const onMonthChange = vi.fn();
      renderMenu({
        blockedDays: blockedDays(onMonthChange),
        value: new Date(2030, 0, 12),
      });
      fireEvent.click(screen.getByText("tasks:datePicker.pickDate"));

      const away = screen.getByRole("button", { name: /January 16th, 2030/ });
      expect(away).toBeDisabled();
      expect(away.closest("td")).toHaveClass("*:line-through");
      expect(
        screen.getByRole("button", { name: /January 17th, 2030/ }),
      ).toBeEnabled();
      expect(
        screen.getByText("Struck-through days: Ann is away"),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /next month/i }));
      expect(onMonthChange).toHaveBeenCalledWith(new Date(2030, 1, 1));
    });
  });
});
