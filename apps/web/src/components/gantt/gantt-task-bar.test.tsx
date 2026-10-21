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
import { GanttTaskBar } from "./gantt-task-bar";
import type {
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
});
