import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { TimeOffBalancesPanel } from "./time-off-balances-panel";

const m = vi.hoisted(() => ({
  balances: {} as Record<string, unknown>,
  balancesArgs: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
    i18n: { resolvedLanguage: "en-US" },
  }),
  Trans: (props: {
    i18nKey: string;
    components: { link: ReactElement<{ children?: ReactNode }> };
  }) => cloneElement(props.components.link, {}, props.i18nKey),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: (props: { to: string; className?: string; children?: ReactNode }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "me" } }),
}));
vi.mock("@/hooks/queries/time-off/use-time-off-balances", () => ({
  useTimeOffBalances: (...args: unknown[]) => {
    m.balancesArgs(...args);
    return m.balances;
  },
}));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({
      data: {
        members: [
          { userId: "ana", user: { name: "Ana Lee", image: null } },
          { userId: "me", user: { name: "Mia", image: null } },
        ],
      },
    }),
  }),
);
vi.mock("./member-balance-row", () => ({
  MemberBalanceRow: (props: {
    member: { name: string };
    type: string;
    isViewer: boolean;
    defaultAllowanceDays: number;
  }) => (
    <tr>
      <td>
        {props.member.name}
        {props.isViewer ? ":viewer" : ""}:{props.type}:
        {props.defaultAllowanceDays}
      </td>
    </tr>
  ),
}));

function balance(userId: string) {
  const figures = {
    allowanceDays: 20,
    allowanceSource: "default",
    usedDays: 0,
    pendingDays: 0,
    remainingDays: 20,
  };
  return {
    workspaceId: "w1",
    userId,
    year: 2026,
    types: { vacation: figures, sick: figures, public_holiday: figures },
  };
}

beforeEach(() => {
  m.balancesArgs.mockReset();
  m.balances = {
    data: {
      workspaceId: "w1",
      year: 2026,
      defaultAllowances: { vacation: 20, sick: 8, public_holiday: 12 },
      members: [balance("ana"), balance("me")],
    },
    isPlaceholderData: false,
  };
});

afterEach(() => cleanup());

describe("TimeOffBalancesPanel", () => {
  it("reads the year of the month shown", () => {
    render(
      <TimeOffBalancesPanel
        workspaceId="w1"
        month="2026-11"
        onMonthChange={() => {}}
      />,
    );

    expect(m.balancesArgs).toHaveBeenCalledWith("w1", 2026);
  });

  it("shows one vacation row per member, the viewer first, with the default as their placeholder", () => {
    render(
      <TimeOffBalancesPanel
        workspaceId="w1"
        month="2026-11"
        onMonthChange={() => {}}
      />,
    );

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Mia:viewer:vacation:20",
      "Ana Lee:vacation:20",
    ]);
  });

  it("links to workspace settings for the default allowances", () => {
    render(
      <TimeOffBalancesPanel
        workspaceId="w1"
        month="2026-11"
        onMonthChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "team:timeOff.balances.defaultsInSettings",
      }),
    ).toHaveAttribute("href", "/dashboard/settings/workspace/time-off");
    expect(
      screen.queryByRole("textbox", { name: "team:timeOff.types.vacation" }),
    ).not.toBeInTheDocument();
  });

  it("switches every row to the type picked", () => {
    render(
      <TimeOffBalancesPanel
        workspaceId="w1"
        month="2026-11"
        onMonthChange={() => {}}
      />,
    );

    const types = screen.getByRole("group", {
      name: "team:timeOff.balances.typeLabel",
    });
    expect(types).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "team:timeOff.types.publicHoliday" }),
    );

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Mia:viewer:public_holiday:12",
      "Ana Lee:public_holiday:12",
    ]);
    expect(
      screen.getByText(/team:timeOff\.balances\.publicHolidayHint/),
    ).toBeInTheDocument();
  });

  it("steps a whole year with the year switcher", () => {
    const onMonthChange = vi.fn();
    render(
      <TimeOffBalancesPanel
        workspaceId="w1"
        month="2026-11"
        onMonthChange={onMonthChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "team:timeOff.yearNav.previous" }),
    );
    expect(onMonthChange).toHaveBeenCalledWith("2025-11");
  });

  it("offers a retry when loading fails", () => {
    const refetch = vi.fn();
    m.balances = { isError: true, isFetching: false, refetch };
    render(
      <TimeOffBalancesPanel
        workspaceId="w1"
        month="2026-11"
        onMonthChange={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "team:timeOff.balances.loadError",
    );
    fireEvent.click(screen.getByRole("button", { name: /tryAgain/ }));
    expect(refetch).toHaveBeenCalled();
  });
});
