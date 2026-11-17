import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import { HolidayCalendarCard } from "./holiday-calendar-card";

const m = vi.hoisted(() => ({
  holidays: {} as Record<string, unknown>,
  holidaysArgs: vi.fn(),
  save: vi.fn(),
  cancel: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
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
vi.mock("@/hooks/queries/time-off/use-holiday-countries", () => ({
  useHolidayCountries: () => ({
    data: [
      { code: "AT", name: "Austria" },
      { code: "DE", name: "Germany" },
    ],
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/queries/time-off/use-holiday-regions", () => ({
  useHolidayRegions: (_workspaceId: string, country: string | null) => ({
    data: country === "DE" ? [{ code: "BY", name: "Bavaria" }] : [],
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/mutations/time-off/use-set-holiday-calendar", () => ({
  useSetHolidayCalendar: () => ({ mutateAsync: m.save, isPending: false }),
}));
vi.mock(
  "@/hooks/mutations/time-off/use-cancel-holiday-calendar-request",
  () => ({
    useCancelHolidayCalendarRequest: () => ({
      mutateAsync: m.cancel,
      isPending: false,
    }),
  }),
);
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

const AUSTRIA = {
  country: "AT",
  countryName: "Austria",
  region: null,
  regionName: null,
};

const BAVARIA = {
  workspaceId: "w1",
  userId: "me",
  year: 2027,
  calendar: {
    country: "DE",
    countryName: "Germany",
    region: "BY",
    regionName: "Bavaria",
  },
  calendarChosen: true,
  pendingRequest: null,
  holidayCalendarDeadline: null,
  nextChangeNeedsApproval: false,
  holidays: [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-06", name: "Epiphany" },
    // A Sunday.
    { date: "2027-10-03", name: "German Unity Day" },
  ],
};

const TO_AUSTRIA = {
  id: "r1",
  workspaceId: "w1",
  userId: "me",
  status: "pending",
  version: 0,
  calendar: AUSTRIA,
  createdAt: "2026-11-10T12:00:00.000Z",
  updatedAt: "2026-11-10T12:00:00.000Z",
};

function renderCard({ canEdit = true } = {}) {
  render(
    <HolidayCalendarCard
      workspaceId="w1"
      year={2027}
      today="2026-11-14"
      canEdit={canEdit}
    />,
  );
}

function useHolidays(overrides: Record<string, unknown>) {
  m.holidays = { data: { ...BAVARIA, ...overrides }, isError: false };
}

async function openForm(name = "team:timeOff.holidays.changeLabel") {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })));
  return screen.getByRole("combobox", {
    name: "team:timeOff.holidays.countryLabel",
  });
}

async function pickCountry(input: HTMLElement, name: string) {
  await act(async () => fireEvent.keyDown(input, { key: "ArrowDown" }));
  const option = await screen.findByRole("option", { name });
  await act(async () => fireEvent.click(option, { detail: 1 }));
}

async function submit(name: string) {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })));
}

beforeEach(() => {
  m.holidays = { data: BAVARIA, isError: false };
  m.holidaysArgs.mockReset();
  m.save.mockReset().mockResolvedValue({ status: "applied" });
  m.cancel.mockReset().mockResolvedValue({});
  m.success.mockReset();
  m.error.mockReset();
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

afterEach(cleanup);

describe("HolidayCalendarCard", () => {
  it("shows the calendar and the year's holidays, weekend ones marked", () => {
    renderCard();

    expect(m.holidaysArgs).toHaveBeenCalledWith("w1", 2027, { lang: "en-US" });
    expect(
      screen.getByText("team:timeOff.holidays.calendarName|Germany|Bavaria"),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", {
      name: "team:timeOff.holidays.listLabel|2027",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "New Year's DayJan 1, 2027",
      "EpiphanyJan 6, 2027",
      "German Unity Dayteam:timeOff.holidays.weekendOct 3, 2027",
    ]);
  });

  it("explains how to add holidays without a calendar", () => {
    useHolidays({ calendar: null, holidays: [] });
    renderCard();

    expect(
      screen.getByText("team:timeOff.holidays.noCalendar"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("team:timeOff.holidays.noCalendarHint"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("is read-only without permission to request time off", () => {
    renderCard({ canEdit: false });

    expect(
      screen.queryByRole("button", {
        name: "team:timeOff.holidays.changeLabel",
      }),
    ).not.toBeInTheDocument();
  });

  it("clears the calendar with No calendar and hands focus back", async () => {
    renderCard();
    const country = await openForm();

    expect(country).toHaveFocus();
    expect(country).toHaveValue("Germany");
    expect(
      screen.getByRole("combobox", {
        name: "team:timeOff.holidays.regionLabel",
      }),
    ).toHaveValue("Bavaria");
    expect(
      screen.queryByText("team:timeOff.holidays.approvalNote"),
    ).not.toBeInTheDocument();

    await pickCountry(country, "team:timeOff.holidays.noCalendar");
    expect(
      screen.queryByRole("combobox", {
        name: "team:timeOff.holidays.regionLabel",
      }),
    ).not.toBeInTheDocument();
    await submit("team:timeOff.holidays.save");

    expect(m.save).toHaveBeenCalledWith({
      userId: undefined,
      country: null,
      region: null,
    });
    expect(m.success).toHaveBeenCalledWith("team:timeOff.holidays.cleared");
    expect(
      screen.getByRole("button", {
        name: "team:timeOff.holidays.changeLabel",
      }),
    ).toHaveFocus();
  });

  it("records No calendar as a first choice", async () => {
    useHolidays({ calendar: null, calendarChosen: false, holidays: [] });
    renderCard();
    const country = await openForm();

    expect(country).toHaveValue("team:timeOff.holidays.noCalendar");
    await submit("team:timeOff.holidays.save");

    expect(m.save).toHaveBeenCalledWith({
      userId: undefined,
      country: null,
      region: null,
    });
    expect(m.success).toHaveBeenCalledWith("team:timeOff.holidays.cleared");
  });

  it("closes without saving when nothing changed", async () => {
    renderCard();
    await openForm();
    await submit("team:timeOff.holidays.save");

    expect(m.save).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: "team:timeOff.holidays.changeLabel",
      }),
    ).toHaveFocus();
  });

  it("sends a change for approval once the free choice is used", async () => {
    useHolidays({ nextChangeNeedsApproval: true });
    m.save.mockResolvedValue({ status: "pending" });
    renderCard();

    const change = screen.getByRole("button", {
      name: "team:timeOff.holidays.requestChangeLabel",
    });
    expect(change).toHaveTextContent("team:timeOff.holidays.requestChange");
    const country = await openForm("team:timeOff.holidays.requestChangeLabel");
    // Keeping the calendar in effect would change nothing.
    expect(
      screen.getByRole("button", { name: "team:timeOff.holidays.save" }),
    ).toHaveAccessibleDescription("team:timeOff.holidays.approvalNote");

    await pickCountry(country, "Austria");
    await submit("team:timeOff.holidays.sendForApproval");

    expect(m.save).toHaveBeenCalledWith({
      userId: undefined,
      country: "AT",
      region: null,
    });
    expect(m.success).toHaveBeenCalledWith("team:timeOff.holidays.requestSent");
  });

  it("shows the change waiting for approval and withdraws it", async () => {
    useHolidays({ pendingRequest: TO_AUSTRIA, nextChangeNeedsApproval: true });
    renderCard();

    expect(screen.getByRole("status")).toHaveTextContent(
      "team:timeOff.holidays.pending|Austria",
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "team:timeOff.holidays.withdrawLabel",
        }),
      ),
    );

    expect(m.cancel).toHaveBeenCalledWith("r1");
    expect(m.success).toHaveBeenCalledWith("team:timeOff.holidays.withdrawn");
    expect(
      screen.getByRole("button", {
        name: "team:timeOff.holidays.requestChangeLabel",
      }),
    ).toHaveFocus();
  });

  it("asks for No calendar by name", () => {
    useHolidays({
      pendingRequest: { ...TO_AUSTRIA, calendar: null },
      nextChangeNeedsApproval: true,
    });
    renderCard();

    expect(screen.getByRole("status")).toHaveTextContent(
      "team:timeOff.holidays.pending|team:timeOff.holidays.noCalendar",
    );
  });

  it("says when the change was decided before it could be withdrawn", async () => {
    useHolidays({ pendingRequest: TO_AUSTRIA, nextChangeNeedsApproval: true });
    m.cancel.mockRejectedValue(
      new HttpError(409, "This request was already approved", {
        code: "TIME_OFF_STATUS",
      }),
    );
    renderCard();

    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "team:timeOff.holidays.withdrawLabel",
        }),
      ),
    );

    expect(m.error).toHaveBeenCalledWith(
      "team:timeOff.holidays.withdrawDecided",
    );
    expect(m.success).not.toHaveBeenCalled();
    // The refetched card drops the change, so focus moves before it goes.
    expect(
      screen.getByRole("button", {
        name: "team:timeOff.holidays.requestChangeLabel",
      }),
    ).toHaveFocus();
  });

  it("shows a pending change without a withdraw button when read-only", () => {
    useHolidays({ pendingRequest: TO_AUSTRIA, nextChangeNeedsApproval: true });
    renderCard({ canEdit: false });

    expect(screen.getByRole("status")).toHaveTextContent(
      "team:timeOff.holidays.pending|Austria",
    );
    expect(
      screen.queryByRole("button", {
        name: "team:timeOff.holidays.withdrawLabel",
      }),
    ).not.toBeInTheDocument();
  });

  it("starts the form from the pending change and keeps it as it is", async () => {
    useHolidays({ pendingRequest: TO_AUSTRIA, nextChangeNeedsApproval: true });
    renderCard();

    const country = await openForm("team:timeOff.holidays.requestChangeLabel");
    expect(country).toHaveValue("Austria");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await submit("team:timeOff.holidays.sendForApproval");

    expect(m.save).not.toHaveBeenCalled();
  });

  it.each([
    // The deadline moved, so a first choice is free again.
    ["a member without a choice", { calendar: null, calendarChosen: false }],
    // Sent before their role could approve.
    ["an approver", {}],
  ])(
    "applies the pending change as it is once %s no longer needs approval",
    async (_, overrides) => {
      useHolidays({
        ...overrides,
        pendingRequest: TO_AUSTRIA,
        nextChangeNeedsApproval: false,
      });
      renderCard();

      const country = await openForm();
      expect(country).toHaveValue("Austria");
      await submit("team:timeOff.holidays.save");

      expect(m.save).toHaveBeenCalledWith({
        userId: undefined,
        country: "AT",
        region: null,
      });
      expect(m.success).toHaveBeenCalledWith("team:timeOff.holidays.saved");
    },
  );

  it("withdraws the pending change by picking the calendar in effect", async () => {
    useHolidays({
      calendar: AUSTRIA,
      pendingRequest: {
        ...TO_AUSTRIA,
        calendar: { ...BAVARIA.calendar, region: null, regionName: null },
      },
      nextChangeNeedsApproval: true,
    });
    renderCard();

    const country = await openForm("team:timeOff.holidays.requestChangeLabel");
    expect(country).toHaveValue("Germany");
    await pickCountry(country, "Austria");
    await submit("team:timeOff.holidays.save");

    expect(m.save).toHaveBeenCalledWith({
      userId: undefined,
      country: "AT",
      region: null,
    });
    expect(m.success).toHaveBeenCalledWith("team:timeOff.holidays.withdrawn");
  });

  it("offers a retry when loading fails", () => {
    const refetch = vi.fn();
    m.holidays = { isError: true, isFetching: false, refetch };
    renderCard();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "team:timeOff.holidays.loadError",
    );
    fireEvent.click(screen.getByRole("button", { name: /tryAgain/ }));
    expect(refetch).toHaveBeenCalled();
  });
});
