import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { InboxTimeOff } from "./inbox-time-off";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params: { workspaceId: string };
    search?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      {...props}
      data-search={JSON.stringify(search)}
      href={to.replace("$workspaceId", params.workspaceId)}
    >
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}|${options.count}`,
  }),
}));

afterEach(cleanup);

const dates = {
  workspaceId: "workspace-2",
  timeOffId: "time-off-1",
  startDate: "2026-11-16",
  endDate: "2026-11-20",
};

describe("InboxTimeOff", () => {
  it("sends approvers to Approvals for a new request", () => {
    render(
      <InboxTimeOff
        type="time_off_requested"
        workspaceId="workspace-1"
        eventData={{
          ...dates,
          requesterId: "user-2",
          requesterName: "Ana Lee",
          days: 5,
        }}
      />,
    );

    const link = screen.getByRole("link", {
      name: "notifications:inbox.openTimeOff",
    });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/workspace/workspace-2/time-off",
    );
    expect(link).toHaveAttribute(
      "data-search",
      JSON.stringify({ view: "approvals" }),
    );
    expect(screen.getByText("Ana Lee")).toBeInTheDocument();
    expect(screen.getByText("team:timeOff.weekdays|5")).toBeInTheDocument();
    expect(
      screen.getByText("notifications:inbox.timeOff.requestedBy"),
    ).toBeInTheDocument();
  });

  it("sends the requester to their own time off for a decision", () => {
    render(
      <InboxTimeOff
        type="time_off_declined"
        workspaceId="workspace-1"
        eventData={{
          ...dates,
          days: 5,
          deciderId: "user-3",
          deciderName: "Mina",
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "notifications:inbox.openTimeOff" }),
    ).toHaveAttribute(
      "data-search",
      JSON.stringify({ view: "mine", month: "2026-11" }),
    );
    expect(
      screen.getByText("notifications:inbox.timeOff.declinedBy"),
    ).toBeInTheDocument();
    expect(screen.getByText("Mina")).toBeInTheDocument();
  });

  it("shows who is away without a weekday count", () => {
    render(
      <InboxTimeOff
        type="time_off_member_away"
        workspaceId="workspace-1"
        eventData={{ ...dates, userId: "user-2", userName: null }}
      />,
    );

    expect(screen.getByText("common:people.someone")).toBeInTheDocument();
    expect(screen.queryByText(/team:timeOff.weekdays/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "notifications:inbox.openTimeOff" }),
    ).toHaveAttribute(
      "data-search",
      JSON.stringify({ view: "team", month: "2026-11" }),
    );
  });

  it("sends approvers to Approvals for a holiday calendar request, without dates", () => {
    render(
      <InboxTimeOff
        type="time_off_holiday_calendar_requested"
        workspaceId="workspace-1"
        eventData={{
          workspaceId: "workspace-2",
          requestId: "request-1",
          requesterId: "user-2",
          requesterName: "Ana Lee",
        }}
      />,
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "team:timeOff.holidays.title",
    );
    expect(
      screen.getByRole("link", { name: "notifications:inbox.openTimeOff" }),
    ).toHaveAttribute("data-search", JSON.stringify({ view: "approvals" }));
    expect(screen.getByText("Ana Lee")).toBeInTheDocument();
    expect(
      screen.getByText("notifications:inbox.timeOff.hintRequested"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/team:timeOff.weekdays/)).toBeNull();
  });

  it("sends the member to their own time off for a holiday calendar decision", () => {
    render(
      <InboxTimeOff
        type="time_off_holiday_calendar_approved"
        workspaceId="workspace-1"
        eventData={{
          workspaceId: "workspace-1",
          requestId: "request-1",
          deciderId: "user-3",
          deciderName: "Mina",
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "notifications:inbox.openTimeOff" }),
    ).toHaveAttribute("data-search", JSON.stringify({ view: "mine" }));
    expect(
      screen.getByText("notifications:inbox.timeOff.approvedBy"),
    ).toBeInTheDocument();
    expect(screen.getByText("Mina")).toBeInTheDocument();
    expect(
      screen.getByText(
        "notifications:inbox.timeOff.hintHolidayCalendarDecided",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to the inbox workspace and the page title without dates", () => {
    render(
      <InboxTimeOff
        type="time_off_member_away"
        workspaceId="workspace-1"
        eventData={null}
      />,
    );

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "team:timeOff.pageTitle",
    );
    expect(
      screen.getByRole("link", { name: "notifications:inbox.openTimeOff" }),
    ).toHaveAttribute("href", "/dashboard/workspace/workspace-1/time-off");
  });
});
