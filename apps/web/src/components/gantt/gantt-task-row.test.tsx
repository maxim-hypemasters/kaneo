import { cleanup, fireEvent, render } from "@testing-library/react";
import { parseISO } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { GanttTaskRow } from "./gantt-task-row";
import type { ScheduledTask } from "./gantt-types";
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
  getStatusLabel: (status: string) => status,
}));

afterEach(cleanup);

const timeline = buildGanttTimeline(
  { start: parseISO("2026-09-01"), end: parseISO("2026-09-30") },
  2.75,
);

function task(extra: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: "checkout",
    title: "Checkout",
    number: 7,
    description: null,
    status: "to-do",
    priority: null,
    startDate: "2026-09-01",
    dueDate: "2026-09-09",
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: "u1",
    assigneeId: "u1",
    assigneeName: "Alice",
    projectId: "project",
    featureId: null,
    scheduleStart: parseISO("2026-09-01"),
    scheduleEnd: parseISO("2026-09-09"),
    ...extra,
  };
}

const feature = (extra: Partial<ScheduledTask> = {}) =>
  task({
    type: "feature",
    subtaskCounts: { completed: 3, total: 5 },
    ...extra,
  });

function show(scheduled: ScheduledTask, onOpenTask = vi.fn()) {
  const { container } = render(
    <GanttTaskRow
      task={scheduled}
      projectSlug="PROJ"
      timeline={timeline}
      pixelsPerDay={44}
      isMobile={false}
      showTaskRail
      rowGridTemplateColumns="20rem 1fr"
      showAssignee
      onOpenTask={onOpenTask}
      onCommit={vi.fn()}
    />,
  );
  const rail = container.querySelector<HTMLElement>("[data-gantt-rail] button");
  if (!rail) throw new Error("no rail");
  return { container, rail };
}

const dates = "Sep 1, 2026 - Sep 9, 2026";
const progress = "tasks:gantt.featureBar.progress(completed=3,total=5)";
const progressAria = "tasks:gantt.featureBar.progressAria(completed=3,count=5)";

describe("GanttTaskRow", () => {
  it("leaves a plain task's rail and bar as they were", () => {
    const { container, rail } = show(task());

    expect(rail).toHaveAccessibleName(`to-doPROJ-7 Checkout ${dates} • Alice`);
    expect(rail.querySelector("svg")).toBeNull();
    expect(
      container.querySelector('[data-gantt-bar="task"]'),
    ).toBeInTheDocument();
  });

  it("marks a feature with its icon and its tasks' progress", () => {
    const onOpenTask = vi.fn();
    const { container, rail } = show(feature(), onOpenTask);

    expect(rail.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(rail).toHaveTextContent(`${dates} • Alice • ${progress}`);
    expect(rail).toHaveAccessibleName(
      `to-doPROJ-7 tasks:features.badge Checkout ${dates} • Alice, ${progressAria}`,
    );
    expect(
      container.querySelector('[data-gantt-bar="feature"]'),
    ).toBeInTheDocument();

    fireEvent.click(rail);
    expect(onOpenTask).toHaveBeenCalledTimes(1);
  });

  it("leaves the progress out for a feature without tasks", () => {
    const { rail } = show(
      feature({ subtaskCounts: { completed: 0, total: 0 } }),
    );

    expect(rail).toHaveTextContent("tasks:features.badge");
    expect(rail).not.toHaveTextContent("featureBar.progress");
  });
});
