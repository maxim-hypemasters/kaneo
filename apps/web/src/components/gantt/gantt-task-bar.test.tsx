import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { parseISO } from "date-fns";
import type { ComponentProps } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { toReleaseDate } from "@/lib/releases/release-date";
import { GanttTaskBar } from "./gantt-task-bar";
import type {
  GanttTaskEdit,
  ScheduledTask,
  ScheduledLeaf,
  ScheduledMilestone,
} from "./gantt-types";
import { buildGanttTimeline } from "./timeline";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options
        ? `${key}(${Object.entries(options)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(",")})`
        : key,
  }),
}));

vi.mock("@/lib/i18n/domain", () => ({
  getStatusLabel: (status: string) => `status:${status}`,
}));

// jsdom has no PointerEvent; this one carries pointerType like the real one.
class TestPointerEvent extends MouseEvent {
  pointerType: string;
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Sep 1–30, 2026: day N is grid column N, 44px wide.
const DAY_PX = 44;
const timeline = buildGanttTimeline(
  { start: parseISO("2026-09-01"), end: parseISO("2026-09-30") },
  2.75,
);

function task(
  start: string,
  end: string,
  extra: Partial<ScheduledLeaf> = {},
): ScheduledLeaf {
  return {
    id: "checkout",
    title: "Checkout",
    number: 1,
    description: null,
    status: "to-do",
    priority: null,
    startDate: start,
    dueDate: end,
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: "u1",
    assigneeId: "u1",
    assigneeName: "Alice",
    projectId: "project",
    featureId: null,
    milestoneId: null,
    scheduleStart: parseISO(start),
    scheduleEnd: parseISO(end),
    ...extra,
  };
}

const milestone = (
  start: string,
  end: string,
  extra: Partial<ScheduledMilestone> = {},
): ScheduledMilestone => ({
  ...task(start, end),
  type: "milestone",
  entityKind: "milestone",
  milestoneId: "checkout",
  milestone: {
    id: "checkout",
    featureId: "F",
    featureTitle: "Feature",
    title: "Checkout",
    projectId: "project",
    position: 0,
    leadId: "u1",
    status: "to-do",
    priority: "no-priority",
    releaseId: null,
    progress: { total: 5, started: 3, completed: 3 },
  },
  subtaskCounts: { completed: 3, total: 5 },
  ...extra,
});

function show(
  scheduled: ScheduledTask,
  props: Partial<ComponentProps<typeof GanttTaskBar>> = {},
) {
  const onCommit = vi.fn();
  const onOpenTask = vi.fn();
  const view = render(
    <GanttTaskBar
      task={scheduled}
      timeline={timeline}
      pixelsPerDay={DAY_PX}
      onCommit={onCommit}
      onOpenTask={onOpenTask}
      {...props}
    />,
  );
  const bar = view.container.querySelector<HTMLElement>("[data-gantt-bar]");
  return { ...view, bar, onCommit, onOpenTask };
}

const milestoneBar = () =>
  screen.getByRole("button", {
    name: "tasks:gantt.milestones.bar.ariaLabel(title=Checkout)",
  });
const progress = "tasks:gantt.milestones.bar.progress(completed=3,total=5)";
const progressAria =
  "tasks:gantt.milestones.bar.progressAria(completed=3,count=5)";
// The bracket tips the summary band draws under its unclipped ends.
const tips = (bar: HTMLElement | null) =>
  Array.from(
    bar?.querySelectorAll<HTMLElement>("[data-gantt-summary-tip]") ?? [],
    (tip) => tip.dataset.ganttSummaryTip,
  );

function drag(target: HTMLElement, dx: number) {
  fireEvent.pointerDown(target, { button: 0, clientX: 500, clientY: 300 });
  // buttons: 1 — the primary button is held, as during any real drag.
  fireEvent.pointerMove(window, {
    clientX: 500 + dx,
    clientY: 300,
    buttons: 1,
  });
  fireEvent.pointerUp(window, { clientX: 500 + dx, clientY: 300 });
}

describe("GanttTaskBar", () => {
  it("draws a task as a plain bar", () => {
    const { bar } = show(task("2026-09-03", "2026-09-05"));

    expect(bar).toHaveAttribute("data-gantt-bar", "task");
    expect(bar?.style.gridColumn).toBe("3 / 6");
    expect(bar?.querySelector("[data-gantt-summary-shape]")).toBeNull();
    const button = screen.getByRole("button", {
      name: "tasks:gantt.taskAriaLabel(title=Checkout)",
    });
    expect(button).toHaveTextContent(/^Checkout$/);
    expect(button).not.toHaveAccessibleDescription();
  });

  it("fills the days planned work runs on, with exact-time accessible text", () => {
    const first = {
      start: parseISO("2026-09-03T15:00:00"),
      end: parseISO("2026-09-03T17:00:00"),
    };
    const second = {
      start: parseISO("2026-09-04T09:00:00"),
      end: parseISO("2026-09-04T11:00:00"),
    };
    const { bar, onCommit, onOpenTask } = show(
      task("2026-09-03T15:00:00", "2026-09-04T11:00:00", {
        scheduleApplied: true,
        scheduleSegments: [first, second],
      }),
    );
    // Thursday and Friday, whole, as one card.
    expect(bar?.style.gridColumn).toBe("3 / 5");
    expect(bar?.querySelectorAll("[data-gantt-work-segment]")).toHaveLength(0);
    const button = screen.getByRole("button", {
      name: "tasks:gantt.taskAriaLabel(title=Checkout)",
    });
    expect(button).toHaveAccessibleDescription(
      `${first.start.toLocaleString()} – ${first.end.toLocaleString()}; ${second.start.toLocaleString()} – ${second.end.toLocaleString()}`,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    drag(button, DAY_PX);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onOpenTask).toHaveBeenCalledTimes(1);
  });

  it("leaves days without planned work as gaps", () => {
    const { bar } = show(
      task("2026-09-04T13:00:00", "2026-09-07T13:00:00", {
        scheduleApplied: true,
        scheduleSegments: [
          {
            start: parseISO("2026-09-04T13:00:00"),
            end: parseISO("2026-09-04T17:00:00"),
          },
          {
            start: parseISO("2026-09-07T09:00:00"),
            end: parseISO("2026-09-07T13:00:00"),
          },
        ],
      }),
    );
    // Friday to Monday, drawn as Friday and Monday.
    expect(bar?.style.gridColumn).toBe("4 / 8");
    const blocks = bar?.querySelectorAll<HTMLElement>(
      "[data-gantt-work-segment]",
    );
    expect(
      Array.from(blocks ?? [], (block) => [
        block.style.left,
        block.style.width,
      ]),
    ).toEqual([
      ["calc(0% + 4px)", "calc(25% - 8px)"],
      ["calc(75% + 4px)", "calc(25% - 8px)"],
    ]);
  });

  it("draws a milestone as a summary bar with its tasks' progress", () => {
    const { bar } = show(milestone("2026-09-03", "2026-09-05"));

    expect(bar).toHaveAttribute("data-gantt-bar", "milestone");
    expect(bar?.style.gridColumn).toBe("3 / 6");
    expect(bar?.querySelector("[data-gantt-summary-shape]")).not.toBeNull();
    expect(tips(bar)).toEqual(["start", "end"]);
    expect(milestoneBar()).toHaveTextContent("Checkout");
    expect(milestoneBar()).toHaveTextContent(progress);
    // The visible count is a bare "3/5"; screen readers get it in words.
    expect(milestoneBar()).toHaveAccessibleDescription(progressAria);
    // As on release pages, the diamond fills with the share that's done.
    const diamond = milestoneBar().querySelector("svg.lucide-diamond");
    expect(diamond?.querySelector("clipPath path")).not.toBeNull();
    expect(diamond).toHaveClass("text-amber-300");
  });

  it("keeps a milestone's label in view while its bar scrolls under the rail", () => {
    show(milestone("2026-09-03", "2026-09-05"));
    // A scroll box would hold the sticky label in place; a clip doesn't.
    expect(milestoneBar()).toHaveClass("overflow-clip");
    expect(milestoneBar()).not.toHaveClass("overflow-hidden");
    expect(milestoneBar().firstElementChild).toHaveClass("sticky");
  });

  it("fills a finished milestone's diamond", () => {
    show(
      milestone("2026-09-03", "2026-09-05", {
        milestone: {
          ...milestone("2026-09-03", "2026-09-05").milestone,
          progress: { total: 5, started: 5, completed: 5 },
        },
      }),
    );
    const diamond = milestoneBar().querySelector("svg.lucide-diamond");
    expect(diamond).toHaveAttribute("fill", "currentColor");
    expect(diamond).not.toHaveClass("text-amber-300");
  });

  it("reads out a dependency note before the progress, so the two don't run together", () => {
    show(milestone("2026-09-03", "2026-09-05"), {
      dependencyNote: "Starts before Design ends.",
    });

    expect(milestoneBar()).toHaveAccessibleDescription(
      `Starts before Design ends. ${progressAria}`,
    );
  });

  it("reads the progress and note as the description only, not again as loose text", () => {
    show(milestone("2026-09-03", "2026-09-05"), {
      dependencyNote: "Starts before Design ends.",
    });

    expect(milestoneBar()).toHaveAccessibleDescription(
      `Starts before Design ends. ${progressAria}`,
    );
    expect(screen.getByText(progressAria)).not.toBeVisible();
    expect(screen.getByText("Starts before Design ends.")).not.toBeVisible();
  });

  it("keeps a milestone's shape and focus indicator in forced colours", () => {
    const { bar } = show(milestone("2026-09-03", "2026-09-05"));
    if (!bar) throw new Error("no bar");

    // Forced colours drop backgrounds and box-shadows: the band is outlined
    // there, the tips keep a system colour, and focus shows as an outline.
    expect(bar.querySelector("[data-gantt-summary-shape]")).toHaveClass(
      "forced-colors:border",
    );
    const tipEls = bar.querySelectorAll("[data-gantt-summary-tip]");
    expect(tipEls).toHaveLength(2);
    for (const tip of tipEls) {
      expect(tip).toHaveClass(
        "forced-color-adjust-none",
        "forced-colors:bg-[CanvasText]",
      );
    }
    const buttons = within(bar).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    for (const button of buttons) {
      expect(button).toHaveClass("focus-visible:outline-hidden");
      expect(button).not.toHaveClass("focus-visible:outline-none");
    }
  });

  it("leaves the progress out for a milestone without tasks", () => {
    show(
      milestone("2026-09-03", "2026-09-05", {
        subtaskCounts: { completed: 0, total: 0 },
      }),
    );
    expect(milestoneBar()).not.toHaveTextContent("milestoneBar.progress");
    expect(milestoneBar()).not.toHaveAccessibleDescription();
    cleanup();

    show(milestone("2026-09-03", "2026-09-05", { subtaskCounts: undefined }));
    expect(milestoneBar()).not.toHaveTextContent("milestoneBar.progress");
    expect(milestoneBar()).not.toHaveAccessibleDescription();
  });

  it("draws an end clipped by the visible range flat", () => {
    const early = show(milestone("2026-08-20", "2026-09-05"));
    expect(early.bar?.style.gridColumn).toBe("1 / 6");
    expect(tips(early.bar)).toEqual(["end"]);
    expect(
      screen.queryByRole("button", { name: "tasks:gantt.resizeStart" }),
    ).toBeNull();
    cleanup();

    const late = show(milestone("2026-09-25", "2026-10-10"));
    expect(late.bar?.style.gridColumn).toBe("25 / 31");
    expect(tips(late.bar)).toEqual(["start"]);
    expect(
      screen.queryByRole("button", { name: "tasks:gantt.resizeDue" }),
    ).toBeNull();
  });

  it("says a milestone kept on an assignee lane can be reassigned", () => {
    show(milestone("2026-09-03", "2026-09-05"), {
      laneDrag: {
        kind: "assignee",
        laneKey: "member:u1",
        resolveLane: () => null,
        onChange: vi.fn(),
      },
    });

    expect(
      screen.getByRole("button", {
        name: "tasks:gantt.milestones.bar.ariaLabelGrouped(title=Checkout)",
      }),
    ).toBeInTheDocument();
  });

  it("opens a milestone on click and from the keyboard", () => {
    const { onOpenTask, onCommit } = show(
      milestone("2026-09-03", "2026-09-05"),
    );

    drag(milestoneBar(), 0);
    expect(onOpenTask).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(milestoneBar(), { key: "Enter" });
    expect(onOpenTask).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(milestoneBar(), { key: " " });
    expect(onOpenTask).toHaveBeenCalledTimes(3);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("moves planned work with its segments when dragged sideways", () => {
    const planned = task("2026-09-03T13:00:00", "2026-09-04T13:00:00", {
      scheduleApplied: true,
      scheduleSegments: [
        {
          start: parseISO("2026-09-03T13:00:00"),
          end: parseISO("2026-09-03T17:00:00"),
        },
        {
          start: parseISO("2026-09-04T09:00:00"),
          end: parseISO("2026-09-04T13:00:00"),
        },
      ],
    });
    const { bar, onCommit } = show(planned, { canMoveDates: true });
    const button = screen.getByRole("button", {
      name: "tasks:gantt.taskAriaLabelMovable(title=Checkout)",
    });
    expect(button).toHaveClass("cursor-grab");
    expect(bar?.style.gridColumn).toBe("3 / 5");

    fireEvent.pointerDown(button, { button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(window, {
      clientX: 500 + 2 * DAY_PX,
      clientY: 300,
      buttons: 1,
    });
    // The preview moves the whole bar.
    expect(bar?.style.gridColumn).toBe("5 / 7");
    fireEvent.pointerUp(window, { clientX: 500 + 2 * DAY_PX, clientY: 300 });

    expect(onCommit).toHaveBeenCalledWith({
      start: parseISO("2026-09-05T13:00:00"),
      end: parseISO("2026-09-06T13:00:00"),
      userId: "u1",
      featureId: null,
      milestoneId: null,
    });
    expect(bar?.style.gridColumn).toBe("3 / 5");
  });

  describe("with weekends hidden", () => {
    // Sep 1 (Tue) to Sep 30: Fri Sep 4 is grid line 4, Mon Sep 7 line 5.
    const weekdays = buildGanttTimeline(
      { start: parseISO("2026-09-01"), end: parseISO("2026-09-30") },
      2.75,
      true,
    );
    const showWeekdays = (scheduled: ScheduledTask) =>
      show(scheduled, { timeline: weekdays, canMoveDates: true });

    it("draws a bar over a weekend contiguous and shorter", () => {
      const { bar } = showWeekdays(task("2026-09-04", "2026-09-08"));
      // Fri, Mon and Tue: three columns, none for the weekend.
      expect(bar?.style.gridColumn).toBe("4 / 7");
    });

    it("draws a bar on weekend days alone one column wide, on the next working day", () => {
      const { bar } = showWeekdays(task("2026-09-05", "2026-09-06"));
      expect(bar?.style.gridColumn).toBe("5 / 6");
    });

    it("moves a bar by columns and keeps its working-day length", () => {
      const { bar, onCommit } = showWeekdays(task("2026-09-07", "2026-09-11"));
      const button = screen.getByRole("button", {
        name: "tasks:gantt.taskAriaLabelMovable(title=Checkout)",
      });
      fireEvent.pointerDown(button, { button: 0, clientX: 500, clientY: 300 });
      fireEvent.pointerMove(window, {
        clientX: 500 + 2 * DAY_PX,
        clientY: 300,
        buttons: 1,
      });
      // Wednesday to Tuesday, over the weekend.
      expect(bar?.style.gridColumn).toBe("7 / 12");
      fireEvent.pointerUp(window, { clientX: 500 + 2 * DAY_PX, clientY: 300 });

      expect(onCommit).toHaveBeenCalledWith({
        start: parseISO("2026-09-09"),
        end: parseISO("2026-09-15"),
        userId: "u1",
        featureId: null,
        milestoneId: null,
      });
    });

    it("snaps a bar that starts on a weekend to a working day when moved", () => {
      const { onCommit } = showWeekdays(task("2026-09-05", "2026-09-08"));
      drag(
        screen.getByRole("button", {
          name: "tasks:gantt.taskAriaLabelMovable(title=Checkout)",
        }),
        DAY_PX,
      );

      expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          start: parseISO("2026-09-08"),
          end: parseISO("2026-09-09"),
        }),
      );
    });

    it("resizes an end over a weekend onto a working day", () => {
      const { bar, onCommit } = showWeekdays(task("2026-09-02", "2026-09-04"));
      const end = bar!.querySelector<HTMLElement>('[data-gantt-resize="end"]')!;
      fireEvent.pointerDown(end, { button: 0, clientX: 500, clientY: 300 });
      fireEvent.pointerMove(window, {
        clientX: 500 + DAY_PX,
        clientY: 300,
        buttons: 1,
      });
      fireEvent.pointerUp(window, { clientX: 500 + DAY_PX, clientY: 300 });

      expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          start: parseISO("2026-09-02"),
          end: parseISO("2026-09-07"),
          exact: true,
        }),
      );
    });

    it("widens a bar on weekend days alone from its start instead of moving it", () => {
      const { bar, onCommit } = showWeekdays(task("2026-09-05", "2026-09-06"));
      const start = bar!.querySelector<HTMLElement>(
        '[data-gantt-resize="start"]',
      )!;
      fireEvent.pointerDown(start, { button: 0, clientX: 500, clientY: 300 });
      fireEvent.pointerMove(window, {
        clientX: 500 - DAY_PX,
        clientY: 300,
        buttons: 1,
      });
      // Friday and the Monday it was drawn on.
      expect(bar?.style.gridColumn).toBe("4 / 6");
      fireEvent.pointerUp(window, { clientX: 500 - DAY_PX, clientY: 300 });
      fireEvent.keyDown(start, { key: "ArrowLeft" });

      const widened = expect.objectContaining({
        start: parseISO("2026-09-04"),
        end: parseISO("2026-09-07"),
        exact: true,
      });
      expect(onCommit).toHaveBeenNthCalledWith(1, widened);
      expect(onCommit).toHaveBeenNthCalledWith(2, widened);
    });

    // Planned work from 9 to 5 on each of the given days.
    const workOn = (first: string, ...rest: string[]) =>
      task(`${first}T09:00:00`, `${rest.at(-1) ?? first}T17:00:00`, {
        scheduleApplied: true,
        scheduleSegments: [first, ...rest].map((day) => ({
          start: parseISO(`${day}T09:00:00`),
          end: parseISO(`${day}T17:00:00`),
        })),
      });
    const blockPlaces = (bar: HTMLElement | null) =>
      Array.from(
        bar?.querySelectorAll<HTMLElement>("[data-gantt-work-segment]") ?? [],
        (block) => [block.style.left, block.style.width],
      );

    it("moves planned work's blocks by columns, like the bar's ends", () => {
      // Monday, Wednesday and Friday.
      const { bar, onCommit } = showWeekdays(
        workOn("2026-09-07", "2026-09-09", "2026-09-11"),
      );
      const places = [
        ["calc(0% + 4px)", "calc(20% - 8px)"],
        ["calc(40% + 4px)", "calc(20% - 8px)"],
        ["calc(80% + 4px)", "calc(20% - 8px)"],
      ];
      expect(bar?.style.gridColumn).toBe("5 / 10");
      expect(blockPlaces(bar)).toEqual(places);

      const button = screen.getByRole("button", {
        name: "tasks:gantt.taskAriaLabelMovable(title=Checkout)",
      });
      fireEvent.pointerDown(button, { button: 0, clientX: 500, clientY: 300 });
      fireEvent.pointerMove(window, {
        clientX: 500 + DAY_PX,
        clientY: 300,
        buttons: 1,
      });
      // Tuesday, Thursday and the next Monday.
      expect(bar?.style.gridColumn).toBe("6 / 11");
      expect(blockPlaces(bar)).toEqual(places);
      fireEvent.pointerUp(window, { clientX: 500 + DAY_PX, clientY: 300 });

      expect(onCommit).toHaveBeenCalledWith({
        start: parseISO("2026-09-08T09:00:00"),
        end: parseISO("2026-09-14T17:00:00"),
        userId: "u1",
        featureId: null,
        milestoneId: null,
      });
    });

    it("leaves a gap beside the only block when the rest of the work is on a weekend", () => {
      // Thursday and Saturday: drawn Thursday to Friday, with Friday off.
      const late = showWeekdays(workOn("2026-09-03", "2026-09-05"));
      expect(late.bar?.style.gridColumn).toBe("3 / 5");
      expect(blockPlaces(late.bar)).toEqual([
        ["calc(0% + 4px)", "calc(50% - 8px)"],
      ]);
      expect(
        screen.getByRole("button", {
          name: "tasks:gantt.taskAriaLabelMovable(title=Checkout)",
        }).firstElementChild,
      ).toHaveClass("hidden");
      cleanup();

      // Saturday and Tuesday: drawn Monday to Tuesday, with Monday off.
      const early = showWeekdays(workOn("2026-09-05", "2026-09-08"));
      expect(early.bar?.style.gridColumn).toBe("5 / 7");
      expect(blockPlaces(early.bar)).toEqual([
        ["calc(50% + 4px)", "calc(50% - 8px)"],
      ]);
    });

    it("fills a bar whose only block covers it", () => {
      const { bar } = showWeekdays(workOn("2026-09-04", "2026-09-07"));
      // Friday and Monday run together without the weekend between them.
      expect(bar?.style.gridColumn).toBe("4 / 6");
      expect(blockPlaces(bar)).toEqual([]);
    });
  });

  describe("resize handles", () => {
    const handle = (bar: HTMLElement | null, edge: "start" | "end") =>
      bar!.querySelector<HTMLElement>(`[data-gantt-resize="${edge}"]`);
    const drag = (target: HTMLElement, days: number) => {
      fireEvent.pointerDown(target, { button: 0, clientX: 500, clientY: 300 });
      fireEvent.pointerMove(window, {
        clientX: 500 + days * DAY_PX,
        clientY: 300,
        buttons: 1,
      });
    };
    const release = (days: number) =>
      fireEvent.pointerUp(window, {
        clientX: 500 + days * DAY_PX,
        clientY: 300,
      });

    it("extends the end by whole days without moving the start or opening the task", () => {
      const { bar, onCommit, onOpenTask } = show(
        task("2026-09-03", "2026-09-05"),
        { canMoveDates: true },
      );
      expect(handle(bar, "end")).toHaveAccessibleName("tasks:gantt.resizeDue");

      drag(handle(bar, "end")!, 2);
      expect(bar?.style.gridColumn).toBe("3 / 8");
      release(2);

      expect(onCommit).toHaveBeenCalledWith({
        start: parseISO("2026-09-03"),
        end: parseISO("2026-09-07"),
        userId: "u1",
        featureId: null,
        milestoneId: null,
        exact: true,
      });
      expect(onOpenTask).not.toHaveBeenCalled();
      expect(bar?.style.gridColumn).toBe("3 / 6");
    });

    it("never drags the start past the end: the bar keeps a day", () => {
      const { bar, onCommit } = show(task("2026-09-03", "2026-09-05"), {
        canMoveDates: true,
      });
      drag(handle(bar, "start")!, 6);
      expect(bar?.style.gridColumn).toBe("5 / 6");
      release(6);
      expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          start: parseISO("2026-09-05"),
          end: parseISO("2026-09-05"),
        }),
      );
    });

    it("saves when the browser reports the release as a buttonless move first", () => {
      const { bar, onCommit } = show(task("2026-09-03", "2026-09-05"), {
        canMoveDates: true,
      });
      drag(handle(bar, "end")!, -1);
      // Same spot, no button: sent just before the pointerup when the
      // element under the pointer changed during the drag.
      fireEvent.pointerMove(window, {
        clientX: 500 - DAY_PX,
        clientY: 300,
        buttons: 0,
      });
      release(-1);

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          start: parseISO("2026-09-03"),
          end: parseISO("2026-09-04"),
        }),
      );
    });

    it("drops a resize whose release went unseen", () => {
      const { bar, onCommit } = show(task("2026-09-03", "2026-09-05"), {
        canMoveDates: true,
      });
      drag(handle(bar, "end")!, 2);
      // No button, and the pointer is somewhere else by now.
      fireEvent.pointerMove(window, { clientX: 900, clientY: 300, buttons: 0 });
      expect(bar?.style.gridColumn).toBe("3 / 6");
      fireEvent.pointerUp(window, { clientX: 900, clientY: 300 });

      expect(onCommit).not.toHaveBeenCalled();
    });

    it("cancels with Escape, and moves an end by a day with the arrow keys", () => {
      const { bar, onCommit } = show(task("2026-09-03", "2026-09-05"), {
        canMoveDates: true,
      });
      drag(handle(bar, "end")!, 2);
      fireEvent.keyDown(window, { key: "Escape" });
      release(2);
      expect(onCommit).not.toHaveBeenCalled();
      expect(bar?.style.gridColumn).toBe("3 / 6");

      fireEvent.keyDown(handle(bar, "start")!, { key: "ArrowLeft" });
      expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          start: parseISO("2026-09-02"),
          end: parseISO("2026-09-05"),
        }),
      );
    });

    it("offers handles on any work the viewer may move, but not on phones", () => {
      // Read-only.
      expect(
        handle(show(task("2026-09-03", "2026-09-05")).bar, "end"),
      ).toBeNull();
      cleanup();
      // Planned work too: resizing takes it off its estimate.
      const planned = show(
        task("2026-09-03", "2026-09-05", { scheduleApplied: true }),
        { canMoveDates: true },
      ).bar;
      expect(handle(planned, "start")).not.toBeNull();
      expect(handle(planned, "end")).not.toBeNull();
      cleanup();
      // Phones pan the timeline instead.
      const phone = show(task("2026-09-03", "2026-09-05"), {
        canMoveDates: true,
        isMobile: true,
      }).bar;
      expect(handle(phone, "end")).toBeNull();
    });
  });

  describe("status", () => {
    it("draws to do strong, in progress light and done faded, dashed and checked", () => {
      const todo = show(
        task("2026-09-03", "2026-09-05", { statusPhase: "todo" }),
      ).bar!;
      expect(todo).toHaveAttribute("data-gantt-phase", "todo");
      expect(todo.className).not.toContain("border-dashed");
      expect(todo.className).not.toContain("opacity-50");
      expect(todo.className).toContain("border-info");
      cleanup();

      const active = show(task("2026-09-03", "2026-09-05")).bar!;
      expect(active).toHaveAttribute("data-gantt-phase", "active");
      expect(active.className).not.toContain("border-dashed");
      expect(active.querySelector("[data-gantt-bar-done]")).toBeNull();
      cleanup();

      const done = show(
        task("2026-09-03", "2026-09-05", { statusPhase: "done", type: "bug" }),
      ).bar!;
      expect(done.className).toContain("border-destructive");
      expect(done.className).toContain("border-dashed");
      expect(done.className).toContain("opacity-50");
      expect(done.querySelector("[data-gantt-bar-done]")).not.toBeNull();
    });

    it("reads the status out only where asked to", () => {
      show(task("2026-09-03", "2026-09-05"), { describeStatus: true });
      expect(
        screen.getByRole("button", {
          name: "tasks:gantt.taskAriaLabel(title=Checkout)",
        }),
      ).toHaveAccessibleDescription("status:to-do");
    });
  });

  it("pans instead of moving work dragged by touch", () => {
    const { onCommit, onOpenTask } = show(task("2026-09-03", "2026-09-05"), {
      canMoveDates: true,
    });
    const button = screen.getByRole("button", {
      name: "tasks:gantt.taskAriaLabelMovable(title=Checkout)",
    });
    fireEvent.pointerDown(button, {
      button: 0,
      clientX: 500,
      clientY: 300,
      pointerType: "touch",
    });
    fireEvent.pointerMove(window, {
      clientX: 500 + 2 * DAY_PX,
      clientY: 300,
      pointerType: "touch",
    });
    fireEvent.pointerUp(window, {
      clientX: 500 + 2 * DAY_PX,
      clientY: 300,
      pointerType: "touch",
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it("keeps a milestone's derived dates fixed during a horizontal drag", () => {
    const { bar, onCommit, onOpenTask } = show(
      milestone("2026-09-03", "2026-09-05"),
    );

    drag(milestoneBar(), 2 * DAY_PX);

    expect(bar?.style.gridColumn).toBe("3 / 6");
    expect(onCommit).not.toHaveBeenCalled();
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it("has no milestone resize handles on desktop or mobile", () => {
    show(milestone("2026-09-03", "2026-09-05"));
    expect(screen.getAllByRole("button")).toHaveLength(1);
    cleanup();
    show(milestone("2026-09-03", "2026-09-09"), { isMobile: true });
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("draws a short phone bar's title and progress after it", () => {
    const { bar } = show(milestone("2026-09-03", "2026-09-03"), {
      isMobile: true,
    });

    // The band keeps the icon; the title inside is for screen readers only.
    expect(milestoneBar()).toHaveTextContent("Checkout");
    expect(milestoneBar()).not.toHaveTextContent(progress);
    const outside = bar?.nextElementSibling;
    expect(outside).toHaveAttribute("aria-hidden", "true");
    expect(outside).toHaveTextContent("Checkout");
    expect(outside).toHaveTextContent(progress);
    expect(milestoneBar()).toHaveAccessibleDescription(progressAria);
  });

  describe("with the assignee shown (grouped by feature)", () => {
    const taskBar = () =>
      screen.getByRole("button", {
        name: "tasks:gantt.taskAriaLabel(title=Checkout)",
      });
    const avatar = (bar: HTMLElement | null) =>
      bar?.querySelector<HTMLElement>("[data-gantt-bar-avatar]") ?? null;

    it("starts a task's bar with its assignee's avatar", () => {
      const { bar } = show(task("2026-09-03", "2026-09-05"), {
        showAssignee: true,
      });

      expect(avatar(bar)).toBeInTheDocument();
      expect(avatar(bar)).toHaveAttribute("aria-hidden", "true");
      expect(taskBar()).toHaveTextContent("Checkout");
      expect(taskBar()).toHaveAccessibleDescription(
        "tasks:gantt.featureLanes.assignee(name=Alice)",
      );
    });

    it("shows an empty avatar on an unassigned task", () => {
      const { bar } = show(
        task("2026-09-03", "2026-09-05", {
          userId: null,
          assigneeId: null,
          assigneeName: null,
        }),
        { showAssignee: true },
      );

      expect(avatar(bar)).toHaveTextContent("?");
      expect(taskBar()).toHaveAccessibleDescription(
        "tasks:assignee.unassigned",
      );
    });

    it("leaves the avatar off a milestone", () => {
      const { bar } = show(milestone("2026-09-03", "2026-09-05"), {
        showAssignee: true,
      });

      expect(avatar(bar)).toBeNull();
      expect(milestoneBar()).toHaveAccessibleDescription(progressAria);
    });

    it("drops the avatar from a bar too short for it, but still reads out the assignee", () => {
      const { bar } = show(task("2026-09-03", "2026-09-03"), {
        showAssignee: true,
      });

      expect(avatar(bar)).toBeNull();
      expect(taskBar()).toHaveAccessibleDescription(
        "tasks:gantt.featureLanes.assignee(name=Alice)",
      );
    });

    it("keeps the avatar in a short phone bar whose title is drawn after it", () => {
      const { bar, container } = show(task("2026-09-03", "2026-09-03"), {
        showAssignee: true,
        isMobile: true,
        pixelsPerDay: 50,
      });

      expect(avatar(bar)).toBeInTheDocument();
      expect(
        container.querySelector('span[aria-hidden="true"].pl-1'),
      ).toHaveTextContent("Checkout");
    });

    it("reads out a dependency note before the assignee", () => {
      show(task("2026-09-03", "2026-09-05"), {
        showAssignee: true,
        dependencyNote: "Starts before Design ends.",
      });

      expect(taskBar()).toHaveAccessibleDescription(
        "Starts before Design ends. tasks:gantt.featureLanes.assignee(name=Alice)",
      );
    });

    it("leaves bars as they were when not asked to", () => {
      const { bar } = show(task("2026-09-03", "2026-09-05"));

      expect(avatar(bar)).toBeNull();
      expect(taskBar()).not.toHaveAccessibleDescription();
    });
  });

  describe("days away", () => {
    // Alice is away Sep 5 and 6 (0-based days 4 and 5) and on Sep 21; Bob is
    // away whenever the work would start or be due on Sep 7.
    const away = {
      runs: [
        { from: 4, to: 6, kind: "vacation" as const },
        { from: 20, to: 21, kind: "away" as const },
      ],
      name: "Alice",
      blockedHint: (edit: GanttTaskEdit) =>
        edit.userId === "u2" ||
        [edit.start, edit.end].some(
          (date) => toReleaseDate(date) === "2026-09-07",
        )
          ? "away on Sep 7"
          : null,
    };
    const marks = (bar: HTMLElement | null) =>
      Array.from(
        bar?.parentElement?.querySelectorAll<HTMLElement>(
          "[data-gantt-away-mark]",
        ) ?? [],
        (mark) => `${mark.dataset.ganttAwayMark} ${mark.style.gridColumn}`,
      );
    const movable = () =>
      screen.getByRole("button", {
        name: "tasks:gantt.taskAriaLabelMovable(title=Checkout)",
      });
    const taskBar = () =>
      screen.getByRole("button", {
        name: "tasks:gantt.taskAriaLabel(title=Checkout)",
      });

    it("marks the days away the bar covers, and says so", () => {
      const { bar } = show(task("2026-09-03", "2026-09-09"), { away });

      expect(marks(bar)).toEqual(["vacation 5 / 7"]);
      expect(taskBar()).toHaveAccessibleDescription(
        expect.stringMatching(
          /^tasks:gantt\.away\.note\(name=Alice,dates=.+\)$/,
        ),
      );
    });

    it("leaves bars clear of days away unmarked", () => {
      const { bar } = show(task("2026-09-08", "2026-09-10"), { away });
      expect(marks(bar)).toEqual([]);
      expect(taskBar()).not.toHaveAccessibleDescription();
    });

    it("moves the marks with a drag, and says why the dates won't save", () => {
      const { bar } = show(task("2026-09-01", "2026-09-03"), {
        away,
        canMoveDates: true,
      });
      expect(marks(bar)).toEqual([]);

      fireEvent.pointerDown(movable(), {
        button: 0,
        clientX: 500,
        clientY: 300,
      });
      fireEvent.pointerMove(window, {
        clientX: 500 + 4 * DAY_PX,
        clientY: 300,
        buttons: 1,
      });
      // Now Sep 5 to 7: on both vacation days, and due on Sep 7.
      expect(marks(bar)).toEqual(["vacation 5 / 7"]);
      expect(screen.getByText("away on Sep 7")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByText("away on Sep 7")).toBeNull();
      expect(marks(bar)).toEqual([]);
    });

    it("says why a resize won't save, until it ends", () => {
      const { bar, onCommit } = show(task("2026-09-01", "2026-09-03"), {
        away,
        canMoveDates: true,
      });
      const end = bar!.querySelector<HTMLElement>('[data-gantt-resize="end"]')!;
      fireEvent.pointerDown(end, { button: 0, clientX: 500, clientY: 300 });
      fireEvent.pointerMove(window, {
        clientX: 500 + 4 * DAY_PX,
        clientY: 300,
        buttons: 1,
      });
      expect(screen.getByText("away on Sep 7")).toBeInTheDocument();

      fireEvent.pointerUp(window, { clientX: 500 + 4 * DAY_PX, clientY: 300 });
      expect(screen.queryByText("away on Sep 7")).toBeNull();
      // The route decides whether it saves.
      expect(onCommit).toHaveBeenCalledOnce();
    });

    it("steps an arrow-key resize past a day away to the next one that saves", () => {
      const nudge = (
        scheduled: ScheduledLeaf,
        edge: "start" | "end",
        key: string,
      ) => {
        const { bar, onCommit } = show(scheduled, { away, canMoveDates: true });
        fireEvent.keyDown(
          bar!.querySelector<HTMLElement>(`[data-gantt-resize="${edge}"]`)!,
          { key },
        );
        cleanup();
        return onCommit;
      };

      // Due Sep 6: Sep 7 is away, so the due date goes to Sep 8.
      let onCommit = nudge(
        task("2026-09-03", "2026-09-06"),
        "end",
        "ArrowRight",
      );
      expect(onCommit).toHaveBeenCalledOnce();
      expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          start: parseISO("2026-09-03"),
          end: parseISO("2026-09-08"),
          exact: true,
        }),
      );

      // Starting Sep 8: back past Sep 7 to Sep 6.
      onCommit = nudge(task("2026-09-08", "2026-09-10"), "start", "ArrowLeft");
      expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          start: parseISO("2026-09-06"),
          end: parseISO("2026-09-10"),
        }),
      );

      // The start can't pass the due date, so the refused day is sent and
      // the route says why.
      onCommit = nudge(task("2026-09-06", "2026-09-07"), "start", "ArrowRight");
      expect(onCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          start: parseISO("2026-09-07"),
          end: parseISO("2026-09-07"),
        }),
      );
    });

    it("won't drop on the lane of someone away on the dates", () => {
      const target = document.createElement("div");
      target.setAttribute("data-gantt-lane", "member:u2");
      document.body.append(target);
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: () => target,
      });
      const onChange = vi.fn();
      const { onCommit } = show(task("2026-09-01", "2026-09-03"), {
        away,
        laneDrag: {
          kind: "assignee",
          laneKey: "member:u1",
          resolveLane: (key) =>
            key === "member:u2"
              ? {
                  kind: "assignee",
                  key,
                  userId: "u2",
                  name: "Bob",
                  droppable: true,
                }
              : null,
          onChange,
        },
      });
      const grouped = screen.getByRole("button", {
        name: "tasks:gantt.taskAriaLabelGrouped(title=Checkout)",
      });

      fireEvent.pointerDown(grouped, { button: 0, clientX: 500, clientY: 300 });
      fireEvent.pointerMove(window, { clientX: 500, clientY: 360, buttons: 1 });
      expect(onChange).toHaveBeenLastCalledWith({
        taskId: "checkout",
        targetLaneKey: null,
      });
      expect(screen.getByText("away on Sep 7")).toBeInTheDocument();
      fireEvent.pointerUp(window, { clientX: 500, clientY: 360 });

      expect(onCommit).not.toHaveBeenCalled();
      Reflect.deleteProperty(document, "elementFromPoint");
      target.remove();
    });
  });
});
