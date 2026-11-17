import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { TimeOffApprovalsPanel } from "./time-off-approvals-panel";

const m = vi.hoisted(() => ({
  pending: {} as Record<string, unknown>,
  calendars: {} as Record<string, unknown>,
  calendarsArgs: vi.fn(),
  users: {} as Record<string, unknown>,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
    i18n: { resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "me" } }),
}));
vi.mock("@/hooks/queries/time-off/use-pending-time-off-requests", () => ({
  usePendingTimeOffRequests: () => m.pending,
}));
vi.mock("@/hooks/queries/time-off/use-holiday-calendar-requests", () => ({
  useHolidayCalendarRequests: (...args: unknown[]) => {
    m.calendarsArgs(...args);
    return m.calendars;
  },
}));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({ useGetActiveWorkspaceUsers: () => m.users }),
);
vi.mock("./time-off-approval-row", () => ({
  TimeOffApprovalRow: (props: {
    request: { id: string };
    member?: { name: string };
    isViewer: boolean;
    onDecided?: () => void;
  }) => (
    <li>
      {props.request.id}:{props.member?.name ?? "?"}
      {props.isViewer ? ":viewer" : ""}
      <button
        type="button"
        aria-label={`decide ${props.request.id}`}
        onClick={props.onDecided}
      />
    </li>
  ),
}));

vi.mock("./holiday-calendar-request-row", () => ({
  HolidayCalendarRequestRow: (props: {
    request: { id: string };
    member?: { name: string };
    isViewer: boolean;
    lang?: string;
    onDecided?: () => void;
  }) => (
    <li>
      {props.request.id}:{props.member?.name ?? "?"}
      {props.isViewer ? ":viewer" : ""}:{props.lang}
      <button
        type="button"
        aria-label={`decide ${props.request.id}`}
        onClick={props.onDecided}
      />
    </li>
  ),
}));

const members = [
  { userId: "me", user: { name: "Mia", image: null } },
  { userId: "ana", user: { name: "Ana Lee", image: null } },
];

beforeEach(() => {
  m.users = { data: { members } };
  m.pending = { data: { requests: [] } };
  m.calendars = { data: { requests: [] } };
  m.calendarsArgs.mockReset();
});

afterEach(() => cleanup());

describe("TimeOffApprovalsPanel", () => {
  it("shows a loading state until both lists arrive", () => {
    m.pending = { data: undefined };
    render(<TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "team:timeOff.loading",
    );
  });

  it("waits for the calendar changes too", () => {
    m.calendars = { data: undefined };
    render(<TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "team:timeOff.loading",
    );
  });

  it("says when nothing is waiting", () => {
    render(<TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />);

    expect(screen.getByText("team:timeOff.approvals.empty")).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(m.calendarsArgs).toHaveBeenCalledWith("w1", "en-US");
  });

  it("lists calendar changes under their own heading", () => {
    m.calendars = {
      data: {
        requests: [
          { id: "c2", userId: "ana" },
          { id: "c1", userId: "me" },
        ],
      },
    };
    render(<TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />);

    expect(
      screen.queryByText("team:timeOff.approvals.empty"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "team:timeOff.approvals.title" }),
    ).not.toBeInTheDocument();
    const list = screen.getByRole("list", {
      name: "team:timeOff.approvals.calendarTitle",
    });
    expect(list.textContent).toBe("c2:Ana Lee:en-USc1:Mia:viewer:en-US");
  });

  it("shows both kinds, time off first", () => {
    m.pending = { data: { requests: [{ id: "t1", userId: "ana" }] } };
    m.calendars = { data: { requests: [{ id: "c1", userId: "ana" }] } };
    render(<TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />);

    const [timeOff, calendars] = screen.getAllByRole("list");
    expect(timeOff).toHaveAccessibleName("team:timeOff.approvals.title");
    expect(timeOff.textContent).toBe("t1:Ana Lee");
    expect(calendars).toHaveAccessibleName(
      "team:timeOff.approvals.calendarTitle",
    );
  });

  it("moves focus to the heading when the last calendar change leaves", () => {
    const panel = () => (
      <TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />
    );
    const c1 = { id: "c1", userId: "ana" };
    const c2 = { id: "c2", userId: "me" };
    m.calendars = { data: { requests: [c1, c2] } };
    const { rerender } = render(panel());

    const first = screen.getByRole("button", { name: "decide c1" });
    first.focus();
    fireEvent.click(first);
    m.calendars = { data: { requests: [c2] } };
    rerender(panel());
    expect(screen.getByRole("button", { name: "decide c2" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "decide c2" }));
    m.calendars = { data: { requests: [] } };
    rerender(panel());
    expect(screen.getByText("team:timeOff.approvals.empty")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "team:timeOff.approvals.title" }),
    ).toHaveFocus();
  });

  it("lists requests in the server's order with the requester's name", () => {
    m.pending = {
      data: {
        requests: [
          { id: "t2", userId: "ana" },
          { id: "t1", userId: "me" },
        ],
      },
    };
    render(<TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />);

    const list = screen.getByRole("list", {
      name: "team:timeOff.approvals.title",
    });
    expect(list.textContent).toBe("t2:Ana Leet1:Mia:viewer");
  });

  it("keeps keyboard focus in the list as decided requests leave it", () => {
    // A new element each time, so a rerender reads the new requests.
    const panel = () => (
      <TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />
    );
    const t1 = { id: "t1", userId: "ana" };
    const t2 = { id: "t2", userId: "me" };
    m.pending = { data: { requests: [t1, t2] } };
    const { rerender } = render(panel());

    const first = screen.getByRole("button", { name: "decide t1" });
    first.focus();
    fireEvent.click(first);
    m.pending = { data: { requests: [t2] } };
    rerender(panel());
    expect(screen.getByRole("button", { name: "decide t2" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "decide t2" }));
    m.pending = { data: { requests: [] } };
    rerender(panel());
    expect(
      screen.getByRole("heading", { name: "team:timeOff.approvals.title" }),
    ).toHaveFocus();
  });

  it("leaves focus the approver moved elsewhere", () => {
    const panel = () => (
      <>
        <button type="button">elsewhere</button>
        <TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />
      </>
    );
    const t2 = { id: "t2", userId: "me" };
    m.pending = { data: { requests: [{ id: "t1", userId: "ana" }, t2] } };
    const { rerender } = render(panel());

    fireEvent.click(screen.getByRole("button", { name: "decide t1" }));
    screen.getByRole("button", { name: "elsewhere" }).focus();
    m.pending = { data: { requests: [t2] } };
    rerender(panel());
    expect(screen.getByRole("button", { name: "decide t2" })).toBeVisible();
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
  });

  it("offers a retry when loading fails", () => {
    const refetch = vi.fn();
    m.pending = { isError: true, isFetching: false, refetch };
    render(<TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "team:timeOff.approvals.loadError",
    );
    fireEvent.click(screen.getByRole("button", { name: /tryAgain/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it("retries only the calendar changes when only they failed", () => {
    const pendingRefetch = vi.fn();
    const refetch = vi.fn();
    m.pending = {
      data: { requests: [] },
      isFetching: false,
      refetch: pendingRefetch,
    };
    m.calendars = { isError: true, isFetching: false, refetch };
    render(<TimeOffApprovalsPanel workspaceId="w1" today="2026-11-14" />);

    fireEvent.click(screen.getByRole("button", { name: /tryAgain/ }));
    expect(refetch).toHaveBeenCalled();
    expect(pendingRefetch).not.toHaveBeenCalled();
  });
});
