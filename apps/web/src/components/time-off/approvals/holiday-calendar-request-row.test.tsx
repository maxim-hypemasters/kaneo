import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { PendingHolidayCalendarRequest } from "@/fetchers/time-off/types";
import { HttpError } from "@/lib/http-error";
import { HolidayCalendarRequestRow } from "./holiday-calendar-request-row";

const m = vi.hoisted(() => ({
  decide: vi.fn(),
  decideArgs: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  onDecided: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
    i18n: { resolvedLanguage: "en-US" },
  }),
}));
vi.mock(
  "@/hooks/mutations/time-off/use-decide-holiday-calendar-request",
  () => ({
    useDecideHolidayCalendarRequest: (...args: unknown[]) => {
      m.decideArgs(...args);
      return { mutateAsync: m.decide, isPending: false };
    },
  }),
);
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

const BAVARIA = "team:timeOff.holidays.calendarName|Germany|Bavaria";

function calendarRequest(
  overrides: Partial<PendingHolidayCalendarRequest> = {},
): PendingHolidayCalendarRequest {
  return {
    id: "r1",
    workspaceId: "w1",
    userId: "ana",
    status: "pending",
    version: 2,
    calendar: {
      country: "AT",
      countryName: "Austria",
      region: null,
      regionName: null,
    },
    currentCalendar: {
      country: "DE",
      countryName: "Germany",
      region: "BY",
      regionName: "Bavaria",
    },
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-10T12:00:00.000Z",
    ...overrides,
  };
}

function renderRow(
  request = calendarRequest(),
  { isViewer = false }: { isViewer?: boolean } = {},
) {
  render(
    <ul>
      <HolidayCalendarRequestRow
        workspaceId="w1"
        request={request}
        member={{ userId: request.userId, name: "Ana Lee", image: null }}
        isViewer={isViewer}
        today="2026-11-14"
        lang="de"
        onDecided={m.onDecided}
      />
    </ul>,
  );
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  m.decide.mockReset().mockResolvedValue({});
  m.decideArgs.mockReset();
  m.success.mockReset();
  m.error.mockReset();
  m.onDecided.mockReset();
});

afterEach(() => cleanup());

describe("HolidayCalendarRequestRow", () => {
  it("shows who asks to change from which calendar to which, and when", () => {
    renderRow();

    expect(screen.getByText("Ana Lee")).toBeInTheDocument();
    expect(
      screen.getByText(
        `team:timeOff.approvals.calendarChange|${BAVARIA}|Austria`,
      ),
    ).toBeInTheDocument();
    // The last change, not the first request.
    expect(
      screen.getByText("team:timeOff.approvals.requestedOn|Nov 10"),
    ).toBeInTheDocument();
    expect(screen.queryByText("team:timeOff.you")).not.toBeInTheDocument();
    expect(m.decideArgs).toHaveBeenCalledWith("w1", "de");
  });

  it("names No calendar on either side", () => {
    renderRow(calendarRequest({ currentCalendar: null, calendar: null }));

    expect(
      screen.getByText(
        "team:timeOff.approvals.calendarChange|team:timeOff.holidays.noCalendar|team:timeOff.holidays.noCalendar",
      ),
    ).toBeInTheDocument();
  });

  it("marks the viewer's own request", () => {
    renderRow(calendarRequest({ userId: "me" }), { isViewer: true });

    expect(screen.getByText("team:timeOff.you")).toBeInTheDocument();
  });

  it("approves with the version on screen", async () => {
    renderRow();

    await click(/team:timeOff\.approvals\.approveCalendarFor\|Ana Lee/);

    expect(m.decide).toHaveBeenCalledWith({
      id: "r1",
      version: 2,
      decision: "approve",
    });
    expect(m.success).toHaveBeenCalledWith(
      "team:timeOff.approvals.calendarApproved|Ana Lee",
    );
    expect(m.onDecided).toHaveBeenCalled();
  });

  it("declines with the version on screen", async () => {
    renderRow(calendarRequest({ version: 5 }));

    await click(/team:timeOff\.approvals\.declineCalendarFor\|Ana Lee/);

    expect(m.decide).toHaveBeenCalledWith({
      id: "r1",
      version: 5,
      decision: "decline",
    });
    expect(m.success).toHaveBeenCalledWith(
      "team:timeOff.approvals.calendarDeclined|Ana Lee",
    );
  });

  it("asks to review again when the member changed the request", async () => {
    m.decide.mockRejectedValue(
      new HttpError(409, "This request changed; review it again", {
        code: "TIME_OFF_CHANGED",
      }),
    );
    renderRow();

    await click(/team:timeOff\.approvals\.approveCalendarFor/);

    expect(m.error).toHaveBeenCalledWith("team:timeOff.approvals.changed");
    expect(m.success).not.toHaveBeenCalled();
    expect(m.onDecided).not.toHaveBeenCalled();
  });

  it("says when someone else already decided or it was withdrawn", async () => {
    m.decide.mockRejectedValue(
      new HttpError(409, "This request was already cancelled", {
        code: "TIME_OFF_STATUS",
      }),
    );
    renderRow();

    await click(/team:timeOff\.approvals\.declineCalendarFor/);

    expect(m.error).toHaveBeenCalledWith(
      "team:timeOff.approvals.alreadyDecided",
    );
    expect(m.onDecided).toHaveBeenCalled();
  });

  it("suggests declining a calendar the holiday data no longer has", async () => {
    m.decide.mockRejectedValue(
      new HttpError(400, "Unknown holiday calendar", {
        code: "TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN",
      }),
    );
    renderRow();

    await click(/team:timeOff\.approvals\.approveCalendarFor/);

    expect(m.error).toHaveBeenCalledWith(
      "team:timeOff.approvals.calendarUnknown",
    );
  });

  it("keeps the server's message for other errors", async () => {
    m.decide.mockRejectedValue(new HttpError(403, "Missing permission"));
    renderRow();

    await click(/team:timeOff\.approvals\.approveCalendarFor/);

    expect(m.error).toHaveBeenCalledWith("Missing permission");
  });
});
