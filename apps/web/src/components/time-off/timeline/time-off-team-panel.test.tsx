import { cleanup, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { TimeOffTeamPanel } from "./time-off-team-panel";

const m = vi.hoisted(() => ({
  calendar: {} as Record<string, unknown>,
  calendarArgs: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
    i18n: { resolvedLanguage: "de-DE" },
  }),
}));
vi.mock("@/hooks/queries/time-off/use-time-off-calendar", () => ({
  useTimeOffCalendar: (...args: unknown[]) => {
    m.calendarArgs(...args);
    return m.calendar;
  },
}));
vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({
      data: {
        members: [{ userId: "ana", user: { name: "Ana Lee", image: null } }],
      },
    }),
  }),
);

function calendar(holidays: unknown[]) {
  return {
    data: {
      workspaceId: "w1",
      from: "2026-11-01",
      to: "2026-11-30",
      entries: [],
      holidays,
    },
    isPlaceholderData: false,
  };
}

function renderPanel() {
  render(
    <TimeOffTeamPanel
      workspaceId="w1"
      month="2026-11"
      today="2026-11-14"
      viewerId="me"
      onMonthChange={() => {}}
    />,
  );
}

beforeEach(() => {
  m.calendarArgs.mockReset();
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

afterEach(cleanup);

describe("TimeOffTeamPanel", () => {
  it("reads the month with holiday names in the viewer's language", () => {
    m.calendar = calendar([]);
    renderPanel();

    expect(m.calendarArgs).toHaveBeenCalledWith(
      "w1",
      "2026-11-01",
      "2026-11-30",
      { lang: "de-DE" },
    );
  });

  it("says nobody is away only without time off and holidays", () => {
    m.calendar = calendar([]);
    renderPanel();
    expect(screen.getByRole("status")).toHaveTextContent(
      "team:timeOff.timeline.empty",
    );
    cleanup();

    m.calendar = calendar([{ userId: "ana", date: "2026-11-18" }]);
    renderPanel();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
