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
import type {
  TimeOffEntry,
  TimeOffHoliday,
  TimeOffRequest,
} from "@/fetchers/time-off/types";
import { entriesByUser } from "./entries-by-user";
import { holidaysByUser } from "./holidays-by-user";
import { TimeOffTimeline } from "./time-off-timeline";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
    i18n: { resolvedLanguage: "en-US" },
  }),
}));

const members = [
  { userId: "me", name: "Mia", image: null },
  { userId: "ana", name: "Ana Lee", image: null },
];

const own: TimeOffRequest = {
  id: "own",
  workspaceId: "w1",
  userId: "me",
  type: "vacation",
  status: "pending",
  startDate: "2026-11-16",
  endDate: "2026-11-20",
  days: 5,
  daysByYear: [{ year: 2026, days: 5 }],
  note: "Lisbon",
  version: 0,
  createdBy: "me",
  statusChangedBy: null,
  statusChangedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  canEdit: true,
  canCancel: true,
  canDecide: false,
};

function renderTimeline(
  entries: TimeOffEntry[],
  handlers = {},
  holidays: TimeOffHoliday[] = [],
) {
  render(
    <TimeOffTimeline
      month="2026-11"
      members={members}
      entriesByUser={entriesByUser(entries)}
      holidaysByUser={holidaysByUser(holidays)}
      viewerId="me"
      today="2026-11-14"
      {...handlers}
    />,
  );
}

beforeEach(() => {
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

afterEach(cleanup);

describe("TimeOffTimeline", () => {
  it("labels the region and marks today in the header", () => {
    renderTimeline([]);
    expect(
      screen.getByRole("region", {
        name: "team:timeOff.timeline.label|November 2026",
      }),
    ).toHaveAttribute("tabindex", "0");
    const current = document.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("14");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows another member as Away, with no type and no edit action", async () => {
    const onEdit = vi.fn();
    const onCancel = vi.fn();
    renderTimeline(
      [
        {
          id: "ana-1",
          userId: "ana",
          startDate: "2026-11-18",
          endDate: "2026-11-20",
        },
      ],
      { onEdit, onCancel },
    );

    const bar = screen.getByRole("button", {
      name: /^team:timeOff\.timeline\.barLabel\|Ana Lee\|/,
    });
    expect(bar).toHaveAttribute("data-status", "away");
    expect(bar).toHaveTextContent("team:timeOff.timeline.away");
    expect(bar).not.toHaveTextContent("team:timeOff.types");

    await act(async () => fireEvent.click(bar));
    expect(
      await screen.findByText("team:timeOff.details.private|Ana Lee"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "team:timeOff.details.edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "team:timeOff.details.cancel" }),
    ).not.toBeInTheDocument();
  });

  it("shows your own pending request dashed, with its details and actions", async () => {
    let focusedOnEdit: Element | null = null;
    const onEdit = vi.fn(() => {
      focusedOnEdit = document.activeElement;
    });
    renderTimeline([own], { onEdit, onCancel: vi.fn() });

    const bar = screen.getByRole("button", {
      name: /^team:timeOff\.timeline\.barLabelPrivate\|Mia\|team:timeOff\.types\.vacation\|team:timeOff\.status\.pending\|/,
    });
    expect(bar).toHaveAttribute("data-status", "pending");
    expect(bar.className).toContain("border-dashed");

    await act(async () => fireEvent.click(bar));
    expect(await screen.findByText("Lisbon")).toBeInTheDocument();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "team:timeOff.details.edit" }),
      ),
    );
    expect(onEdit).toHaveBeenCalledWith(own);
    // The dialog that opens returns focus to the bar, not the closed popover.
    expect(focusedOnEdit).toBe(bar);
  });

  it("names your own holiday and shows a colleague's as Away", async () => {
    renderTimeline([], {}, [
      { userId: "me", date: "2026-11-18", name: "Day of Prayer" },
      { userId: "ana", date: "2026-11-18" },
      // Another month never shows.
      { userId: "ana", date: "2026-12-25" },
    ]);

    const [mine, theirs] = [
      screen.getByRole("listitem", { name: "Mia" }),
      screen.getByRole("listitem", { name: "Ana Lee" }),
    ];
    const named = screen.getByRole("button", {
      name: "team:timeOff.timeline.holidayLabel|Mia|Day of Prayer|Nov 18",
    });
    expect(mine).toContainElement(named);
    expect(named).toHaveAttribute("data-status", "holiday");
    expect(named).toHaveTextContent("Day of Prayer");
    expect(named).not.toHaveAttribute("title");
    expect(named.style.gridColumn).toBe("19 / 20");

    const away = theirs.querySelectorAll("[data-status='away']");
    expect(away).toHaveLength(1);
    expect(away[0]).toHaveTextContent("team:timeOff.timeline.away");
    expect(away[0]).toHaveAccessibleName(
      "team:timeOff.timeline.barLabel|Ana Lee|Nov 18",
    );
    expect(away[0]?.className).not.toContain("success");
    expect(away[0]).not.toHaveTextContent("Day of Prayer");

    await act(async () => fireEvent.click(named));
    expect(
      await screen.findByText(
        "team:timeOff.timeline.holidayNamed|Day of Prayer",
      ),
    ).toBeInTheDocument();
  });

  it("opens a colleague's holiday like their private time off", async () => {
    renderTimeline(
      [
        {
          id: "ana-1",
          userId: "ana",
          startDate: "2026-11-24",
          endDate: "2026-11-24",
        },
      ],
      {},
      [{ userId: "ana", date: "2026-11-18" }],
    );
    const [holiday, entry] = screen.getAllByRole("button", {
      name: /^team:timeOff\.timeline\.barLabel\|Ana Lee\|/,
    });
    expect(holiday).toHaveAccessibleName(
      "team:timeOff.timeline.barLabel|Ana Lee|Nov 18",
    );
    expect(holiday?.className).toBe(entry?.className);
    expect(holiday?.innerHTML).toBe(entry?.innerHTML);

    await act(async () => fireEvent.click(holiday!));
    expect(
      await screen.findByText("team:timeOff.details.private|Ana Lee"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nov 18")).toBeInTheDocument();
  });

  it("clips time off at the month edges and skips other months", () => {
    renderTimeline([
      {
        id: "into",
        userId: "ana",
        startDate: "2026-10-28",
        endDate: "2026-11-03",
      },
      {
        id: "out",
        userId: "ana",
        startDate: "2026-11-30",
        endDate: "2026-12-04",
      },
      {
        id: "october",
        userId: "ana",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
      },
    ]);

    const bars = screen.getAllByRole("button", {
      name: /^team:timeOff\.timeline\.barLabel\|Ana Lee\|/,
    });
    expect(bars).toHaveLength(2);
    const [into, out] = bars;
    expect(into).toHaveAttribute("data-clipped-start", "true");
    expect(into).not.toHaveAttribute("data-clipped-end");
    expect(into.getAttribute("aria-label")).toContain(
      "team:timeOff.timeline.clippedStart",
    );
    expect(out).toHaveAttribute("data-clipped-end", "true");
    expect(out).not.toHaveAttribute("data-clipped-start");
    // The member rail is the first grid column, so day N sits on line N + 1.
    expect(into.style.gridColumn).toBe("2 / 5");
    expect(out.style.gridColumn).toBe("31 / 32");
  });
});
