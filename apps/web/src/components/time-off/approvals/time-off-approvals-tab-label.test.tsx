import { cleanup, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { TimeOffApprovalsTabLabel } from "./time-off-approvals-tab-label";

const m = vi.hoisted(() => ({
  pending: vi.fn(),
  calendars: vi.fn(),
  requests: [] as unknown[],
  calendarRequests: [] as unknown[],
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
  }),
}));
vi.mock("@/hooks/queries/time-off/use-pending-time-off-requests", () => ({
  usePendingTimeOffRequests: (...args: unknown[]) => {
    m.pending(...args);
    return { data: { requests: m.requests } };
  },
}));
vi.mock("@/hooks/queries/time-off/use-holiday-calendar-requests", () => ({
  useHolidayCalendarRequests: (...args: unknown[]) => {
    m.calendars(...args);
    return { data: { requests: m.calendarRequests } };
  },
}));

beforeEach(() => {
  m.pending.mockReset();
  m.calendars.mockReset();
  m.requests = [];
  m.calendarRequests = [];
});

afterEach(() => cleanup());

describe("TimeOffApprovalsTabLabel", () => {
  it("shows the plain label when nothing is waiting", () => {
    render(<TimeOffApprovalsTabLabel workspaceId="w1" enabled />);

    expect(screen.getByText("team:timeOff.views.approvals")).toBeVisible();
    expect(
      screen.queryByText(/team:timeOff\.approvals\.tabLabel/),
    ).not.toBeInTheDocument();
  });

  it("counts the requests waiting, with a label for screen readers", () => {
    m.requests = [{ id: "a" }, { id: "b" }];
    render(<TimeOffApprovalsTabLabel workspaceId="w1" enabled />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(
      screen.getByText("team:timeOff.approvals.tabLabel|2"),
    ).toBeInTheDocument();
  });

  it("counts calendar changes waiting too", () => {
    m.requests = [{ id: "a" }];
    m.calendarRequests = [{ id: "c" }, { id: "d" }];
    render(<TimeOffApprovalsTabLabel workspaceId="w1" enabled />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(
      screen.getByText("team:timeOff.approvals.tabLabel|3"),
    ).toBeInTheDocument();
  });

  it("only reads the pending lists when allowed, in the tab's language", () => {
    render(<TimeOffApprovalsTabLabel workspaceId="w1" enabled={false} />);

    expect(m.pending).toHaveBeenCalledWith("w1", { enabled: false });
    expect(m.calendars).toHaveBeenCalledWith("w1", "en-US", {
      enabled: false,
    });
  });
});
