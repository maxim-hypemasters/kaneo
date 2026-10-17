import { cleanup, render, screen } from "@testing-library/react";
import { parseISO } from "date-fns";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { GanttSpan } from "./gantt-dependencies";
import { GanttDependencyLines } from "./gantt-dependency-lines";
import type { GanttTimeline } from "./timeline";

const span = (start: string, end: string): GanttSpan => ({
  start: parseISO(start),
  end: parseISO(end),
});

// The lanes container starts at y 100 and holds 44px rows.
const boxes: Record<string, { top: number; height: number }> = {
  lanes: { top: 100, height: 132 },
  a: { top: 100, height: 44 },
  b: { top: 144, height: 44 },
};

function draw(spans: Map<string, GanttSpan>, draggingTaskId?: string) {
  render(
    <div data-box="lanes">
      <GanttDependencyLines
        dependencies={[{ id: "a->b", blockerId: "a", blockedId: "b" }]}
        spans={spans}
        // The lines only read where the rendered days start.
        timeline={{ rangeStart: parseISO("2026-03-01") } as GanttTimeline}
        // 44px days next to a 320px task rail (16px rem).
        dayColumnWidthRem={2.75}
        railWidthRem={20}
        layoutKey="a,b"
        draggingTaskId={draggingTaskId}
      />
      <div data-gantt-row="a" data-box="a" />
      <div data-gantt-row="b" data-box="b" />
    </div>,
  );
  return screen
    .getByTestId("gantt-dependency-lines")
    .querySelectorAll("path[marker-end]");
}

const originalRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const box = boxes[this.dataset.box ?? ""] ?? { top: 0, height: 0 };
    return DOMRect.fromRect({ x: 0, y: box.top, width: 0, height: box.height });
  };
});

afterEach(() => {
  cleanup();
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

describe("GanttDependencyLines", () => {
  it("runs from the end of the blocking bar to the start of the blocked one", () => {
    const [line] = draw(
      new Map([
        ["a", span("2026-03-01", "2026-03-03")],
        ["b", span("2026-03-05", "2026-03-06")],
      ]),
    );

    // Bars sit 4px inside their days: a ends at 320 + 3 * 44 - 4, b starts
    // at 320 + 4 * 44 + 4; the rows' centres are 22 and 66.
    expect(line).toHaveAttribute("d", "M 448 22 H 456 V 66 H 500");
    expect(line).not.toHaveAttribute("data-broken");
  });

  it("detours along the blocked row's edge when it starts too early", () => {
    const [line] = draw(
      new Map([
        ["a", span("2026-03-01", "2026-03-03")],
        ["b", span("2026-03-02", "2026-03-04")],
      ]),
    );

    expect(line).toHaveAttribute("d", "M 448 22 H 456 V 44 H 360 V 66 H 368");
    expect(line).toHaveAttribute("data-broken");
  });

  it("fades the lines of a bar being dragged", () => {
    const [line] = draw(
      new Map([
        ["a", span("2026-03-01", "2026-03-03")],
        ["b", span("2026-03-05", "2026-03-06")],
      ]),
      "b",
    );

    expect(line).toHaveAttribute("opacity", "0.25");
  });

  it("draws over lane headers' feature bands, under the bars, click-through", () => {
    draw(new Map());

    // First in the lanes container at z-[1]: over the headers' z-auto
    // content, under the bars that follow it at z-[1].
    expect(screen.getByTestId("gantt-dependency-lines")).toHaveClass(
      "z-[1]",
      "pointer-events-none",
    );
  });

  it("skips dependencies on tasks without a dated row", () => {
    expect(
      draw(new Map([["a", span("2026-03-01", "2026-03-03")]])),
    ).toHaveLength(0);
  });
});
