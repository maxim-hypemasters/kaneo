import { cleanup, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { HolidayCalendarReminder } from "./holiday-calendar-reminder";

const m = vi.hoisted(() => ({
  holidays: {} as Record<string, unknown>,
  holidaysArgs: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
    i18n: { resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/hooks/queries/time-off/use-member-holidays", () => ({
  useMemberHolidays: (...args: unknown[]) => {
    m.holidaysArgs(...args);
    return m.holidays;
  },
}));

const NOT_CHOSEN = {
  calendar: null,
  calendarChosen: false,
  pendingRequest: null,
  holidayCalendarDeadline: "2026-11-30",
  nextChangeNeedsApproval: false,
  holidays: [],
};

function useHolidays(overrides: Record<string, unknown> = {}) {
  m.holidays = { data: { ...NOT_CHOSEN, ...overrides } };
}

function renderReminder({
  canEdit = true,
  canApprove = false,
  today = "2026-11-14",
} = {}) {
  return render(
    <HolidayCalendarReminder
      workspaceId="w1"
      year={2027}
      today={today}
      canEdit={canEdit}
      canApprove={canApprove}
    />,
  );
}

beforeEach(() => {
  m.holidaysArgs.mockReset();
  useHolidays();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HolidayCalendarReminder", () => {
  it("asks for a choice by the deadline, from the holiday card's query", () => {
    renderReminder();

    expect(m.holidaysArgs).toHaveBeenCalledWith("w1", 2027, { lang: "en-US" });
    const reminder = screen.getByRole("status");
    expect(reminder).toHaveTextContent("team:timeOff.holidays.reminder|Nov 30");
    expect(reminder).toHaveTextContent("team:timeOff.holidays.reminderHint");
  });

  it("never tells an approver their later changes need approval", () => {
    renderReminder({ canApprove: true });

    const reminder = screen.getByRole("status");
    expect(reminder).toHaveTextContent("team:timeOff.holidays.reminder|Nov 30");
    expect(reminder).toHaveTextContent(
      "team:timeOff.holidays.reminderApproverHint",
    );
    expect(reminder).not.toHaveTextContent(
      "team:timeOff.holidays.reminderHint",
    );
  });

  it("keeps the server's UTC deadline day after local midnight east of UTC", () => {
    // 23:00 UTC on the deadline day is already the next day in Tokyo.
    vi.setSystemTime(new Date("2026-11-14T23:00:00.000Z"));
    useHolidays({ holidayCalendarDeadline: "2026-11-14" });
    renderReminder({ today: "2026-11-15" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "team:timeOff.holidays.reminder",
    );
  });

  it("says a choice needs approval once the server says the deadline passed", () => {
    useHolidays({
      holidayCalendarDeadline: "2026-11-01",
      nextChangeNeedsApproval: true,
    });
    renderReminder();

    const reminder = screen.getByRole("status");
    expect(reminder).toHaveTextContent("team:timeOff.holidays.reminderPassed");
    expect(reminder).toHaveTextContent(
      "team:timeOff.holidays.reminderPassedHint",
    );
  });

  it.each([
    ["the choice is made", { calendarChosen: true }],
    [
      "a choice waits for approval",
      { pendingRequest: { id: "r1" }, nextChangeNeedsApproval: true },
    ],
    ["there is no deadline", { holidayCalendarDeadline: null }],
    // An approver's choice applies whatever the date.
    [
      "an approver's deadline passed",
      { holidayCalendarDeadline: "2026-11-13" },
    ],
  ])("stays hidden when %s", (_, overrides) => {
    useHolidays(overrides);
    const { container } = renderReminder();

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the deadline day itself", () => {
    useHolidays({ holidayCalendarDeadline: "2026-11-14" });
    renderReminder();

    expect(screen.getByRole("status")).toHaveTextContent(
      "team:timeOff.holidays.reminder|Nov 14",
    );
  });

  it("stays hidden without permission to choose, or before data arrives", () => {
    const { container } = renderReminder({ canEdit: false });
    expect(container).toBeEmptyDOMElement();
    cleanup();

    m.holidays = { data: undefined };
    expect(renderReminder().container).toBeEmptyDOMElement();
  });
});
