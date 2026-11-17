import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { HolidayDeadlineSection } from "./holiday-deadline-section";

const m = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  settingsArgs: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
  }),
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

beforeEach(() => {
  m.settingsArgs.mockReset();
  m.settings = {
    data: { workspaceId: "w1", holidayCalendarDeadline: "2026-11-30" },
  };
});

afterEach(() => cleanup());

describe("HolidayDeadlineSection", () => {
  it("shows the deadline under Public holidays, described by the rule", () => {
    render(<HolidayDeadlineSection workspaceId="w1" enabled />);

    expect(m.settingsArgs).toHaveBeenCalledWith("w1", { enabled: true });
    expect(
      screen.getByRole("heading", {
        name: "settings:workspaceTimeOff.holidaysTitle",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings:workspaceTimeOff.deadlineLabel Nov 30",
      }),
    ).toHaveAccessibleDescription(
      "settings:workspaceTimeOff.holidaysDescription",
    );
  });

  it("shows a skeleton row while loading", () => {
    m.settings = { isPending: true };
    render(<HolidayDeadlineSection workspaceId="w1" enabled={false} />);

    expect(m.settingsArgs).toHaveBeenCalledWith("w1", { enabled: false });
    expect(screen.getAllByTestId("settings-row-skeleton")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers a retry when loading fails", () => {
    const refetch = vi.fn();
    m.settings = { isError: true, isFetching: false, refetch };
    render(<HolidayDeadlineSection workspaceId="w1" enabled />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "settings:workspaceTimeOff.deadlineLoadError",
    );
    fireEvent.click(screen.getByRole("button", { name: /tryAgain/ }));
    expect(refetch).toHaveBeenCalled();
  });
});
