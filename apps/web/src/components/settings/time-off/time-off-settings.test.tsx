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
import { TimeOffSettings } from "./time-off-settings";

const m = vi.hoisted(() => ({
  canApprove: true,
  checking: false,
  memberPending: false,
  defaults: {} as Record<string, unknown>,
  defaultsArgs: vi.fn(),
  settings: {} as Record<string, unknown>,
  settingsArgs: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
  }),
  Trans: (props: {
    i18nKey: string;
    components: { link: ReactElement<{ children?: ReactNode }> };
  }) => cloneElement(props.components.link, {}, props.i18nKey),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: (props: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      href={`${props.to.replace("$workspaceId", props.params?.workspaceId ?? "")}?view=${props.search?.view}`}
    >
      {props.children}
    </a>
  ),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    workspace: { id: "w1", name: "Acme" },
    canApproveTimeOff: () => m.canApprove,
    isCheckingPermissions: m.checking,
  }),
}));
vi.mock("@/hooks/queries/workspace-users/use-active-workspace-user", () => ({
  useGetActiveWorkspaceUser: () => ({ isPending: m.memberPending }),
}));
vi.mock("@/hooks/queries/time-off/use-time-off-allowance-defaults", () => ({
  useTimeOffAllowanceDefaults: (...args: unknown[]) => {
    m.defaultsArgs(...args);
    return m.defaults;
  },
}));
vi.mock("@/hooks/queries/time-off/use-time-off-settings", () => ({
  useTimeOffSettings: (...args: unknown[]) => {
    m.settingsArgs(...args);
    return m.settings;
  },
}));
vi.mock("@/hooks/mutations/time-off/use-set-time-off-settings", () => ({
  useSetTimeOffSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => "2026-11-14",
}));
vi.mock(
  "@/hooks/mutations/time-off/use-set-default-time-off-allowance",
  () => ({
    useSetDefaultTimeOffAllowance: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  }),
);

beforeEach(() => {
  m.canApprove = true;
  m.checking = false;
  m.memberPending = false;
  m.defaultsArgs.mockReset();
  m.settingsArgs.mockReset();
  m.settings = {
    data: { workspaceId: "w1", holidayCalendarDeadline: null },
  };
  m.defaults = {
    data: {
      workspaceId: "w1",
      defaultAllowances: { vacation: 20, sick: 8, public_holiday: 12 },
    },
  };
});

afterEach(() => cleanup());

describe("TimeOffSettings", () => {
  it("shows the default allowance of each type for the active workspace", () => {
    render(<TimeOffSettings />);

    expect(m.defaultsArgs).toHaveBeenCalledWith("w1", { enabled: true });
    expect(
      screen.getByRole("heading", {
        name: "settings:workspaceTimeOff.defaultsTitle",
      }),
    ).toBeInTheDocument();
    for (const [name, value] of [
      ["team:timeOff.types.vacation", "20"],
      ["team:timeOff.types.sick", "8"],
      ["team:timeOff.types.publicHoliday", "12"],
    ]) {
      const field = screen.getByRole("textbox", { name });
      expect(field).toHaveValue(value);
      expect(field).toHaveAccessibleDescription(
        "settings:workspaceTimeOff.perYear settings:workspaceTimeOff.defaultsDescription",
      );
    }
    expect(
      screen.getByRole("link", {
        name: "settings:workspaceTimeOff.overridesNote",
      }),
    ).toHaveAttribute("href", "/dashboard/workspace/w1/time-off?view=balances");
  });

  it("shows the public holiday deadline below the allowances", () => {
    render(<TimeOffSettings />);

    expect(m.settingsArgs).toHaveBeenCalledWith("w1", { enabled: true });
    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings.slice(-2)).toEqual([
      "settings:workspaceTimeOff.defaultsTitle",
      "settings:workspaceTimeOff.holidaysTitle",
    ]);
    expect(
      screen.getByRole("button", {
        name: "settings:workspaceTimeOff.deadlineLabel settings:workspaceTimeOff.noDeadline",
      }),
    ).toBeInTheDocument();
  });

  it.each([
    ["permissions", "checking"],
    ["the member", "memberPending"],
  ] as const)(
    "shows skeleton rows and loads nothing while %s load",
    (_, flag) => {
      m[flag] = true;
      m.canApprove = false;
      m.defaults = { isPending: true };
      m.settings = { isPending: true };
      render(<TimeOffSettings />);

      expect(m.defaultsArgs).toHaveBeenCalledWith("w1", { enabled: false });
      expect(m.settingsArgs).toHaveBeenCalledWith("w1", { enabled: false });
      // Three allowance types and the deadline.
      expect(screen.getAllByTestId("settings-row-skeleton")).toHaveLength(4);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(
        screen.queryByText("settings:workspaceTimeOff.notAllowed.title"),
      ).not.toBeInTheDocument();
    },
  );

  it("offers a retry when loading fails", () => {
    const refetch = vi.fn();
    m.defaults = { isError: true, isFetching: false, refetch };
    render(<TimeOffSettings />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "settings:workspaceTimeOff.loadError",
    );
    fireEvent.click(screen.getByRole("button", { name: /tryAgain/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it("tells members without time_off:approve that they can't change it", () => {
    m.canApprove = false;
    render(<TimeOffSettings />);

    expect(
      screen.getByText("settings:workspaceTimeOff.notAllowed.title"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(m.defaultsArgs).not.toHaveBeenCalled();
    expect(m.settingsArgs).not.toHaveBeenCalled();
  });
});
