import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseISO } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { GanttFeatureLaneHeader } from "./gantt-feature-lane-header";
import type { GanttTaskBar } from "./gantt-task-bar";
import type { GanttFeatureLane, ScheduledTask } from "./gantt-types";
import { buildGanttTimeline } from "./timeline";

type BarProps = Parameters<typeof GanttTaskBar>[0];

const m = vi.hoisted(() => ({ bar: null as BarProps | null }));

// The bar itself is GanttTaskBar's to test; here only what it's given.
vi.mock("./gantt-task-bar", () => ({
  GanttTaskBar: (props: BarProps) => {
    m.bar = props;
    return (
      <button type="button" onClick={props.onOpenTask}>
        {`bar:${props.task.title}`}
      </button>
    );
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const detail = options?.title ?? options?.count;
      return detail === undefined ? key : `${key}:${String(detail)}`;
    },
  }),
}));

afterEach(() => {
  cleanup();
  m.bar = null;
});

// Sep 1–30, 2026: day N is grid column N.
const timeline = buildGanttTimeline(
  { start: parseISO("2026-09-01"), end: parseISO("2026-09-30") },
  2.75,
);

function task(
  id: string,
  start: string,
  end: string,
  hierarchy: Pick<ScheduledTask, "type" | "featureId"> = {},
): ScheduledTask {
  return {
    id,
    title: id,
    number: 1,
    description: null,
    status: "to-do",
    priority: null,
    startDate: start,
    dueDate: end,
    position: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    projectId: "project",
    scheduleStart: parseISO(start),
    scheduleEnd: parseISO(end),
    ...hierarchy,
  };
}

const checkout = task("checkout", "2026-09-01", "2026-09-20", {
  type: "feature",
});
const checkoutLane: GanttFeatureLane = {
  key: "feature:checkout",
  featureId: "checkout",
  name: "Checkout",
  feature: checkout,
  tasks: [
    task("cart", "2026-09-02", "2026-09-04", { featureId: "checkout" }),
    task("pay", "2026-09-06", "2026-09-08", { featureId: "checkout" }),
  ],
  start: parseISO("2026-09-02"),
  end: parseISO("2026-09-08"),
  droppable: true,
};
const noFeatureLane: GanttFeatureLane = {
  key: "no-feature",
  featureId: null,
  name: "No feature",
  feature: null,
  tasks: [task("loose", "2026-09-03", "2026-09-03")],
  start: parseISO("2026-09-03"),
  end: parseISO("2026-09-03"),
  droppable: true,
};

function show(
  lane: GanttFeatureLane,
  overrides: Partial<Parameters<typeof GanttFeatureLaneHeader>[0]> = {},
) {
  const props = {
    lane,
    labelId: "lane-label",
    collapsed: false,
    onToggle: vi.fn(),
    timeline,
    pixelsPerDay: 44,
    isMobile: false,
    showTaskRail: true,
    rowGridTemplateColumns: `20rem max-content`,
    onOpenFeature: vi.fn(),
    onCommitFeature: vi.fn(),
    ...overrides,
  };
  return { ...render(<GanttFeatureLaneHeader {...props} />), props };
}

const toggle = (name: string, count: number) =>
  screen.getByRole("button", {
    name: `${name} tasks:gantt.laneTaskCount:${count}`,
  });

describe("GanttFeatureLaneHeader", () => {
  it("collapses the lane from its name and task count", () => {
    const { props, rerender } = show(checkoutLane);

    const button = toggle("Checkout", 2);
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(button);
    expect(props.onToggle).toHaveBeenCalledTimes(1);

    rerender(<GanttFeatureLaneHeader {...props} collapsed />);
    expect(toggle("Checkout", 2)).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the feature from its own button", () => {
    const { props } = show(checkoutLane);

    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:gantt.featureLanes.open:Checkout",
      }),
    );

    expect(props.onOpenFeature).toHaveBeenCalledWith("checkout");
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it("marks a feature lane with the features icon, and No feature without it", () => {
    const { container, unmount } = show(checkoutLane);
    expect(container.querySelector(".lucide-layers")).not.toBeNull();
    unmount();

    const noFeature = show(noFeatureLane);
    expect(noFeature.container.querySelector(".lucide-layers")).toBeNull();
  });

  it("gives No feature, and a feature that isn't on the board, no open button", () => {
    const { unmount } = show(noFeatureLane);
    expect(toggle("No feature", 1)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /featureLanes\.open/ }),
    ).toBeNull();
    unmount();

    show({
      ...checkoutLane,
      key: "feature:gone",
      featureId: "gone",
      name: "Unknown feature",
      feature: null,
      droppable: false,
    });
    expect(
      screen.queryByRole("button", { name: /featureLanes\.open/ }),
    ).toBeNull();
  });

  it("shows an empty lane's count as plain text, with nothing to collapse", () => {
    const { container } = show({
      ...checkoutLane,
      tasks: [],
      start: null,
      end: null,
    });

    expect(screen.getByText("tasks:gantt.laneTaskCount:0")).toBeInTheDocument();
    expect(container.querySelector("[aria-expanded]")).toBeNull();
    expect(container.querySelector('[data-testid="gantt-lane-summary"]')).toBe(
      null,
    );
  });

  it("draws the feature's own bar as a row, so arrows can attach to it", () => {
    const { container, props } = show(checkoutLane, {
      featureDependencyNote: "Starts before Design ends.",
      onFeatureDragChange: vi.fn(),
    });

    const row = container.querySelector('[data-gantt-row="checkout"]');
    expect(row).toHaveTextContent("bar:checkout");
    expect(m.bar).toMatchObject({
      task: checkout,
      onCommit: props.onCommitFeature,
      onDragChange: props.onFeatureDragChange,
      dependencyNote: "Starts before Design ends.",
    });
    // A feature can't join another feature, so its bar has no lane drag.
    expect(m.bar?.laneDrag).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "bar:checkout" }));
    expect(props.onOpenFeature).toHaveBeenCalledWith("checkout");
  });

  it("has no bar or row when the feature itself isn't on the chart", () => {
    const { container } = show({ ...checkoutLane, feature: null });

    expect(container.querySelector("[data-gantt-row]")).toBeNull();
    expect(m.bar).toBeNull();
    expect(toggle("Checkout", 2)).toBeInTheDocument();
  });

  it("underlines the span of the lane's tasks, not the feature's own dates", () => {
    show(checkoutLane);

    // Sep 2 to Sep 8: columns 2 up to the line before 9.
    expect(
      screen.getByTestId("gantt-lane-summary").getAttribute("style"),
    ).toContain("grid-column: 2 / 9");
  });

  it("gives the underline its own room below the bar, clear of its tips", () => {
    for (const showTaskRail of [true, false]) {
      const { container, unmount } = show(checkoutLane, {
        showTaskRail,
        rowGridTemplateColumns: showTaskRail
          ? "20rem max-content"
          : "max-content",
      });

      // Arrows meet the centre of the bar's own box, which stays a row's
      // height; the line sits in the cell's bottom padding, under that box.
      const row = container.querySelector('[data-gantt-row="checkout"]');
      const line = screen.getByTestId("gantt-lane-summary");
      expect(row).toHaveClass(showTaskRail ? "min-h-11" : "min-h-12");
      expect(row).not.toContainElement(line);
      expect(row?.parentElement).toContainElement(line);
      expect(row?.parentElement).toHaveClass("pb-2");
      unmount();
    }
  });

  it("keeps its name, count and open button in a chip without the rail", () => {
    const { container } = show(checkoutLane, {
      showTaskRail: false,
      rowGridTemplateColumns: "max-content",
    });

    expect(container.querySelector("[data-gantt-rail]")).toBeNull();
    expect(toggle("Checkout", 2)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "tasks:gantt.featureLanes.open:Checkout",
      }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-gantt-row="checkout"]')).not.toBe(
      null,
    );
  });
});
