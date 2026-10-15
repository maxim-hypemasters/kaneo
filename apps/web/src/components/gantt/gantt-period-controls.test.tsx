import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { addDays, parseISO } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { GanttPeriodControls } from "./gantt-period-controls";
import { createGanttViewportStore } from "./gantt-viewport";
import { buildGanttTimeline, GANTT_FIRST_DAY } from "./timeline";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const timeline = buildGanttTimeline(
  { start: parseISO("2026-09-07"), end: parseISO("2026-12-06") },
  2.75,
);

function setup(span = timeline) {
  const viewport = createGanttViewportStore();
  const onGoToDate = vi.fn();
  const onPage = vi.fn();
  const view = render(
    <GanttPeriodControls
      timeline={span}
      viewport={viewport}
      onGoToDate={onGoToDate}
      onPage={onPage}
    />,
  );
  return { viewport, onGoToDate, onPage, view };
}

const dateField = () => screen.getByLabelText("tasks:gantt.periodStart");

afterEach(() => {
  cleanup();
});

describe("GanttPeriodControls", () => {
  it("shows the rendered span until the viewport is measured", () => {
    setup();
    expect(dateField()).toHaveValue("2026-09-07");
    expect(screen.getByText("– Dec 6, 2026")).toBeInTheDocument();
  });

  it("follows the visible days as the timeline scrolls", () => {
    const { viewport } = setup();

    act(() => {
      viewport.set({
        first: parseISO("2026-10-12"),
        last: parseISO("2026-10-28"),
      });
    });

    expect(dateField()).toHaveValue("2026-10-12");
    expect(screen.getByText("– Oct 28, 2026")).toBeInTheDocument();
  });

  it("keeps showing the same day when the span grows before it", () => {
    const { viewport, view } = setup();
    act(() => {
      viewport.set({
        first: parseISO("2026-10-12"),
        last: parseISO("2026-10-28"),
      });
    });

    const grown = buildGanttTimeline(
      {
        start: addDays(parseISO("2026-09-07"), -91),
        end: parseISO("2026-12-06"),
      },
      2.75,
    );
    view.rerender(
      <GanttPeriodControls
        timeline={grown}
        viewport={viewport}
        onGoToDate={vi.fn()}
        onPage={vi.fn()}
      />,
    );

    expect(dateField()).toHaveValue("2026-10-12");
  });

  it("jumps to a typed date and pages with the arrows", () => {
    const { onGoToDate, onPage } = setup();

    fireEvent.change(dateField(), { target: { value: "2030-03-04" } });
    expect(onGoToDate).toHaveBeenCalledWith(parseISO("2030-03-04"));

    fireEvent.click(
      screen.getByRole("button", { name: "tasks:gantt.nextPeriod" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:gantt.previousPeriod" }),
    );
    expect(onPage.mock.calls).toEqual([[1], [-1]]);
  });

  it("only disables an arrow at the first supported day", () => {
    setup(
      buildGanttTimeline(
        { start: GANTT_FIRST_DAY, end: addDays(GANTT_FIRST_DAY, 181) },
        2.75,
      ),
    );

    expect(
      screen.getByRole("button", { name: "tasks:gantt.previousPeriod" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "tasks:gantt.nextPeriod" }),
    ).not.toBeDisabled();
  });
});
