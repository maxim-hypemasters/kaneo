import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { remToPx } from "@/components/gantt/gantt-scroll";
import { ReleasePlanTimeline } from "./release-plan-timeline";
import {
  previewRelease,
  previewTask,
  releasePreview,
} from "./preview-fixtures";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(cleanup);

describe("release proposal Gantt", () => {
  it("keeps assignee headings, task bars, and dependencies without a duplicate task list", async () => {
    const preview = releasePreview(
      [
        previewTask("a"),
        previewTask("b", {
          type: "bug",
          start: "2026-10-26T13:00:00Z",
          end: "2026-10-26T17:00:00Z",
          segments: [
            { start: "2026-10-26T13:00:00Z", end: "2026-10-26T17:00:00Z" },
          ],
        }),
      ],
      { dependencies: [{ blockerId: "a", blockedId: "b" }] },
    );
    const { container } = render(
      <ReleasePlanTimeline
        projectId="project"
        preview={preview}
        release={previewRelease}
      />,
    );
    const region = screen.getByRole("region", {
      name: "tasks:releases.planning.previewChart.timeline",
    });
    expect(region).toHaveAttribute("tabindex", "0");
    const lane = within(region).getByRole("region", { name: "Max" });
    expect(within(lane).getByRole("heading", { name: /Max/ })).toBeVisible();
    expect(
      within(region).queryByText("tasks:gantt.taskHeader"),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-gantt-row]")).toHaveLength(2);
    expect(lane.querySelector("[data-gantt-rail]")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-gantt-preview-bar]")).toHaveLength(
      2,
    );
    expect(
      container.querySelectorAll("[data-gantt-work-segment]"),
    ).toHaveLength(0);
    expect(
      container.querySelector('[data-release-line="start"]'),
    ).toBeInTheDocument();
    const arrows = screen
      .getByTestId("gantt-dependency-lines")
      .querySelectorAll("path[marker-end]");
    expect(arrows).toHaveLength(1);
    expect(arrows[0]).not.toHaveAttribute("data-broken");
    const blockerBar = container.querySelector<HTMLButtonElement>(
      '[data-gantt-preview-bar="a"]',
    )!;
    const blockedBar = container.querySelector<HTMLButtonElement>(
      '[data-gantt-preview-bar="b"]',
    )!;
    const fromX = remToPx(
      Number.parseFloat(blockerBar.style.left) +
        Number.parseFloat(blockerBar.style.width),
    );
    const toX = remToPx(Number.parseFloat(blockedBar.style.left));
    const path = arrows[0].getAttribute("d");
    expect(path?.startsWith(`M ${fromX} `)).toBe(true);
    expect(path?.endsWith(` H ${toX}`)).toBe(true);
    expect(within(lane).queryByText("Work a")).not.toBeInTheDocument();
    expect(within(lane).getAllByText("EPD-a")).toHaveLength(1);
    expect(blockerBar).toHaveAccessibleName("EPD-a; Work a");
    expect(
      screen.queryByRole("button", { name: /Estimate|Assignee|Priority/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(blockerBar);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Work a" })).toBeVisible(),
    );
  });
  it("shows an empty chart without repeating work that has no placement", () => {
    render(
      <ReleasePlanTimeline
        projectId="project"
        release={previewRelease}
        preview={releasePreview([
          previewTask("excluded", {
            start: null,
            end: null,
            segments: [],
            reason: "no_estimate",
            currentStart: "2026-10-25T09:00:00Z",
          }),
          previewTask("done", {
            completed: true,
            start: null,
            end: null,
            segments: [],
          }),
        ])}
      />,
    );
    const viewport = screen.getByTestId("release-plan-timeline-scroll");
    expect(
      within(viewport).queryByText("Work excluded"),
    ).not.toBeInTheDocument();
    expect(within(viewport).queryByText("Work done")).not.toBeInTheDocument();
    expect(
      within(viewport).getByText(
        "tasks:releases.planning.previewChart.noScheduled",
      ),
    ).toBeVisible();
  });
  it("lets the wheel scroll rows normally over the date grid", () => {
    render(
      <ReleasePlanTimeline
        projectId="project"
        release={previewRelease}
        preview={releasePreview([previewTask("scheduled")])}
      />,
    );
    const viewport = screen.getByTestId("release-plan-timeline-scroll");
    const bar = within(viewport).getByRole("button", {
      name: /Work scheduled/,
    });
    const previous = viewport.scrollLeft;
    const timelineWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });
    fireEvent(bar, timelineWheel);
    expect(timelineWheel.defaultPrevented).toBe(false);
    expect(viewport.scrollLeft).toBe(previous);
  });
  it("retains calculated release markers when live release dates change during review", () => {
    const preview = releasePreview([previewTask("a")]);
    const view = render(
      <ReleasePlanTimeline
        projectId="project"
        release={previewRelease}
        preview={preview}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "tasks:releases.dates.start: Oct 26, 2026",
      }),
    ).toBeInTheDocument();
    view.rerender(
      <ReleasePlanTimeline
        projectId="project"
        release={{
          ...previewRelease,
          startDate: "2026-11-01",
          codeFreezeDate: "2026-11-09",
          submissionDate: "2026-11-10",
        }}
        preview={preview}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "tasks:releases.dates.start: Oct 26, 2026",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", {
        name: "tasks:releases.dates.start: Nov 1, 2026",
      }),
    ).not.toBeInTheDocument();
  });
  it("keeps an empty proposal browsable using release dates and existing date navigation", () => {
    render(
      <ReleasePlanTimeline
        projectId="project"
        preview={releasePreview([])}
        release={previewRelease}
      />,
    );
    expect(
      screen.getByRole("button", { name: "tasks:gantt.previousPeriod" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "tasks:gantt.nextPeriod" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("tasks:gantt.periodStart")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "tasks:gantt.jumpToToday" }),
    ).toBeVisible();
    expect(screen.getByText("tasks:releases.planning.empty")).toBeVisible();
  });

  it("reveals and highlights a requested task beyond the rendered date range", async () => {
    const late = previewTask("far", {
      start: "2032-04-12T09:00:00Z",
      end: "2032-04-12T13:00:00Z",
      segments: [
        { start: "2032-04-12T09:00:00Z", end: "2032-04-12T13:00:00Z" },
      ],
    });
    const preview = releasePreview([previewTask("early"), late]);
    const view = render(
      <ReleasePlanTimeline
        projectId="project"
        release={previewRelease}
        preview={preview}
      />,
    );
    expect(
      view.container.querySelector('[data-gantt-preview-bar="far"]'),
    ).not.toBeInTheDocument();
    view.rerender(
      <ReleasePlanTimeline
        projectId="project"
        release={previewRelease}
        preview={preview}
        focusRequest={{ taskId: "far", requestId: 1 }}
      />,
    );
    await waitFor(() =>
      expect(
        view.container.querySelector('[data-gantt-preview-bar="far"]'),
      ).toBeInTheDocument(),
    );
    expect(
      view.container.querySelector('[data-gantt-row="far"]'),
    ).toHaveAttribute("data-gantt-focused", "true");
    expect(
      view.container.querySelector('[data-gantt-row="early"]'),
    ).not.toHaveAttribute("data-gantt-focused");
  });
});
