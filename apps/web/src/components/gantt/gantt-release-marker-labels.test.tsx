import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { GanttReleaseMarkerLabels } from "./gantt-release-marker-labels";
import type { ReleaseMarkerDay } from "./release-marker-days";
import { buildGanttTimeline } from "./timeline";

const i18n = vi.hoisted(() => ({ resolvedLanguage: "en-US" }));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    i18n,
    t: (key: string, options?: Record<string, string>) =>
      options ? `${options.name}: ${options.kind}, ${options.date}` : key,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    "aria-label": label,
  }: {
    children: ReactNode;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a href="/release" className={className} aria-label={label}>
      {children}
    </a>
  ),
}));

const timeline = buildGanttTimeline(
  { start: new Date(2026, 9, 1), end: new Date(2026, 9, 30) },
  2,
);

// 2.4's code freeze and submission fall on one day.
const days: ReleaseMarkerDay[] = [
  {
    index: 19,
    pinned: false,
    date: "2026-10-20",
    releases: [
      {
        id: "r1",
        name: "2.4",
        date: "2026-10-20",
        kinds: ["codeFreeze", "submission"],
      },
    ],
  },
];

function renderLabels(
  markerDays: ReleaseMarkerDay[] = days,
  shownTimeline = timeline,
) {
  render(
    <GanttReleaseMarkerLabels
      days={markerDays}
      timeline={shownTimeline}
      dayColumnWidthRem={2}
      workspaceId="workspace-1"
      projectId="project-1"
      today="2026-10-17"
    />,
  );
}

afterEach(() => {
  cleanup();
  i18n.resolvedLanguage = "en-US";
});

describe("GanttReleaseMarkerLabels", () => {
  it("lists the kinds on one day the way the viewer's language does", () => {
    renderLabels();
    expect(screen.getByRole("link")).toHaveAccessibleName(
      "2.4: tasks:releases.dates.codeFreeze and tasks:releases.dates.submission, Oct 20",
    );
    cleanup();

    i18n.resolvedLanguage = "ja-JP";
    renderLabels();
    expect(screen.getByRole("link")).toHaveAccessibleName(
      /tasks:releases\.dates\.codeFreeze、tasks:releases\.dates\.submission/,
    );
  });

  it("keeps the links' touch hit areas inside the strip", () => {
    renderLabels();

    // touch-hitbox grows the link to 44px on coarse pointers; the strip is
    // 24px, so without the clip taps on the first row's top reach the link.
    const strip = screen.getByRole("list", {
      name: "tasks:releases.gantt.strip",
    });
    expect(screen.getByRole("link")).toHaveClass("touch-hitbox");
    expect(strip).toHaveClass("h-6", "overflow-y-clip");
    expect(screen.getByRole("link")).toHaveClass("focus-visible:ring-inset");
  });

  it("names each date on a pinned weekend marker by its own day", () => {
    // Weekends hidden: 2.4's Saturday code freeze and Sunday submission, and
    // 2.5's Sunday start, share the Fri/Mon boundary.
    renderLabels(
      [
        {
          index: 2,
          pinned: true,
          date: "2026-10-03",
          releases: [
            {
              id: "r1",
              name: "2.4",
              date: "2026-10-03",
              kinds: ["codeFreeze"],
            },
            {
              id: "r1",
              name: "2.4",
              date: "2026-10-04",
              kinds: ["submission"],
            },
            { id: "r2", name: "2.5", date: "2026-10-04", kinds: ["start"] },
          ],
        },
      ],
      buildGanttTimeline(
        { start: new Date(2026, 9, 1), end: new Date(2026, 9, 30) },
        2,
        true,
      ),
    );

    expect(
      screen
        .getAllByRole("link")
        .map((link) => link.getAttribute("aria-label")),
    ).toEqual([
      "2.4: tasks:releases.dates.codeFreeze, Oct 3",
      "2.4: tasks:releases.dates.submission, Oct 4",
      "2.5: tasks:releases.dates.start, Oct 4",
    ]);
    // 2.4's name shows once, after both of its dates' icons.
    expect(screen.getAllByText("2.4")).toHaveLength(1);
    expect(screen.getAllByRole("link")[1]).toHaveTextContent("2.4");
  });
});
