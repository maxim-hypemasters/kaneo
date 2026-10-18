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
    date: "2026-10-20",
    releases: [{ id: "r1", name: "2.4", kinds: ["codeFreeze", "submission"] }],
  },
];

function renderLabels() {
  render(
    <GanttReleaseMarkerLabels
      days={days}
      timeline={timeline}
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
});
