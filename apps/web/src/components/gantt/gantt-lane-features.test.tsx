import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { parseISO } from "date-fns";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { GanttLaneFeatures } from "./gantt-lane-features";
import type { GanttFeatureSpan, GanttLaneFeature } from "./gantt-types";
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

afterEach(cleanup);

// Sep 1–30, 2026: day N is grid column N.
const timeline = buildGanttTimeline(
  { start: parseISO("2026-09-01"), end: parseISO("2026-09-30") },
  2.75,
);

const span = (
  featureId: string,
  start: string,
  end: string,
  taskCount = 1,
): GanttFeatureSpan => ({
  featureId,
  title: featureId,
  start: parseISO(start),
  end: parseISO(end),
  taskCount,
});
const placed = (
  feature: GanttFeatureSpan,
  track: number,
): GanttLaneFeature => ({
  ...feature,
  track,
});

function show(
  features: GanttLaneFeature[],
  {
    overflow = [] as GanttFeatureSpan[],
    trackCount = Math.max(0, ...features.map((feature) => feature.track + 1)),
    railWidthRem = 20,
    onOpenFeature = vi.fn(),
  } = {},
) {
  return render(
    <GanttLaneFeatures
      features={features}
      overflowFeatures={overflow}
      trackCount={trackCount}
      timeline={timeline}
      railWidthRem={railWidthRem}
      onOpenFeature={onOpenFeature}
    />,
  );
}

const chips = () =>
  screen.queryAllByRole("button", { name: /featureOverflowAria/ });
// The chip's box: the hidden features' days in the last track.
const chipBox = (chip: HTMLElement) =>
  chip.closest<HTMLElement>("[data-gantt-feature-overflow]");

const sliceName = (title: string, count: number, start: string, end: string) =>
  `tasks:gantt.featureSliceAria(title=${title},count=${count},start=${start},end=${end})`;
// The bracket tips the summary band draws under its unclipped ends.
const tips = (slice: HTMLElement) =>
  Array.from(
    slice.querySelectorAll<HTMLElement>("[data-gantt-summary-tip]"),
    (tip) => tip.dataset.ganttSummaryTip,
  );

describe("GanttLaneFeatures", () => {
  it("renders nothing without tracks", () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws each feature over its days, named for screen readers, and opens it", () => {
    const onOpenFeature = vi.fn();
    show([placed(span("Checkout", "2026-09-03", "2026-09-05", 2), 0)], {
      onOpenFeature,
    });

    expect(
      screen.getByRole("group", { name: "tasks:gantt.featuresLabel" }),
    ).toBeInTheDocument();
    const slice = screen.getByRole("button", {
      name: sliceName("Checkout", 2, "Sep 3, 2026", "Sep 5, 2026"),
    });
    expect(slice).toHaveTextContent("Checkout");
    expect(slice.style.gridColumn).toBe("3 / 6");
    expect(slice).toHaveClass("ml-1", "mr-1");
    // Drawn as a summary bar, with a bracket tip under each end.
    expect(slice.querySelector("[data-gantt-summary-shape]")).not.toBeNull();
    expect(tips(slice)).toEqual(["start", "end"]);

    fireEvent.click(slice);
    expect(onOpenFeature).toHaveBeenCalledWith("Checkout");
  });

  it("leaves dependency arrows over the bands, and keeps their shape in forced colours", () => {
    show([placed(span("Checkout", "2026-09-03", "2026-09-05"), 0)]);

    // The arrows' layer is z-[1]; a z-index here would paint the solid
    // bands over every arrow crossing the header.
    const group = screen.getByRole("group", {
      name: "tasks:gantt.featuresLabel",
    });
    expect(group.className).not.toMatch(/(^|\s)z-/);
    // Forced colours drop the band's fill and its box-shadow focus ring.
    const slice = screen.getByRole("button", { name: /title=Checkout/ });
    expect(slice).toHaveClass("focus-visible:outline-hidden");
    expect(slice.querySelector("[data-gantt-summary-shape]")).toHaveClass(
      "forced-colors:border",
    );
  });

  it("stacks tracks, flattens clipped ends and skips features out of view", () => {
    const { container } = show([
      placed(span("Early", "2026-08-20", "2026-09-02"), 0),
      placed(span("Late", "2026-09-25", "2026-10-10"), 1),
      placed(span("Gone", "2026-10-05", "2026-10-07"), 1),
      // A track with nothing in view still renders, keeping the height.
      placed(span("Old", "2026-07-01", "2026-07-02"), 2),
    ]);

    expect(
      container.querySelectorAll("[data-gantt-feature-track]"),
    ).toHaveLength(3);
    const early = screen.getByRole("button", { name: /title=Early/ });
    expect(early.style.gridColumn).toBe("1 / 3");
    expect(tips(early)).toEqual(["end"]);
    expect(early).not.toHaveClass("ml-1");
    expect(early).toHaveClass("mr-1");
    const late = screen.getByRole("button", { name: /title=Late/ });
    expect(late.style.gridColumn).toBe("25 / 31");
    expect(tips(late)).toEqual(["start"]);
    expect(late).toHaveClass("ml-1");
    expect(late).not.toHaveClass("mr-1");
    expect(screen.queryByRole("button", { name: /title=Gone/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /title=Old/ })).toBeNull();
  });

  it("collects overlapping features past the last track into a chip that lists them", async () => {
    const onOpenFeature = vi.fn();
    const { container } = show(
      [
        placed(span("One", "2026-09-01", "2026-09-10"), 0),
        placed(span("Two", "2026-09-02", "2026-09-10"), 1),
      ],
      {
        trackCount: 2,
        overflow: [
          span("Three", "2026-09-04", "2026-09-06", 3),
          span("Four", "2026-09-05", "2026-09-07"),
        ],
        onOpenFeature,
      },
    );

    const [chip] = chips();
    if (!chip) throw new Error("no chip");
    expect(chip).toHaveAccessibleName(
      "tasks:gantt.featureOverflowAria(count=2)",
    );
    expect(chip).toHaveTextContent("tasks:gantt.featureOverflow(count=2)");
    // The button fills its track, and 44px on touch screens; only the chip
    // it draws is the band's height, so a near miss can't open a slice.
    expect(chip.className).not.toMatch(/(^|\s)(sm:)?h-/);
    expect(chip).toHaveClass("touch-hitbox");
    expect(chip).toHaveClass("focus-visible:outline-hidden");
    // In the last track, over the days the two cover between them.
    expect(
      container.querySelector('[data-gantt-feature-track="1"]'),
    ).toContainElement(chip);
    expect(chipBox(chip)?.style.gridColumn).toBe("4 / 8");
    // Over the slices there, not pushed onto a second grid row.
    expect(chipBox(chip)).toHaveClass("row-start-1", "pointer-events-none");
    expect(screen.getByRole("button", { name: /title=Two/ })).toHaveClass(
      "row-start-1",
    );

    fireEvent.click(chip);
    const list = await screen.findByRole("dialog", {
      name: "tasks:gantt.featureOverflowAria(count=2)",
    });
    expect(
      within(list).getByRole("button", { name: /title=Four,count=1/ }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(list).getByRole("button", {
        name: sliceName("Three", 3, "Sep 4, 2026", "Sep 6, 2026"),
      }),
    );
    expect(onOpenFeature).toHaveBeenCalledWith("Three");
  });

  it("spans a hidden feature's whole range, keeping the chip clear of the rail", () => {
    // Long runs well past the placed features, so the chip has to stay on
    // screen however far it scrolls.
    show(
      [
        placed(span("One", "2026-09-01", "2026-09-05"), 0),
        placed(span("Two", "2026-09-01", "2026-09-05"), 1),
      ],
      {
        trackCount: 2,
        overflow: [span("Long", "2026-09-03", "2026-12-15")],
      },
    );

    const [chip] = chips();
    if (!chip) throw new Error("no chip");
    // Clipped to the rendered range, which ends on Sep 30.
    expect(chipBox(chip)?.style.gridColumn).toBe("3 / 31");
    expect(chip).toHaveClass("sticky");
    // The sticky task rail paints over the timeline's first 20rem.
    expect(chip.style.left).toBe("20.125rem");
  });

  it("sticks to the timeline's edge when there is no rail", () => {
    show([placed(span("One", "2026-09-01", "2026-09-05"), 0)], {
      overflow: [span("Hidden", "2026-09-02", "2026-09-04")],
      railWidthRem: 0,
    });

    expect(chips()[0]?.style.left).toBe("0.125rem");
  });

  it("gives each separate group of hidden features its own chip", async () => {
    show([placed(span("One", "2026-09-01", "2026-09-30"), 0)], {
      overflow: [
        span("Early", "2026-09-03", "2026-09-05"),
        span("Before", "2026-08-01", "2026-08-03"),
        span("Late", "2026-09-20", "2026-09-22"),
      ],
    });

    // "Before" is out of view, so its chip is left out.
    const [early, late, ...rest] = chips();
    if (!early || !late) throw new Error("expected two chips");
    expect(rest).toEqual([]);
    expect(chipBox(early)?.style.gridColumn).toBe("3 / 6");
    expect(chipBox(late)?.style.gridColumn).toBe("20 / 23");
    expect(late).toHaveAccessibleName(
      "tasks:gantt.featureOverflowAria(count=1)",
    );

    fireEvent.click(late);
    const list = await screen.findByRole("dialog");
    expect(
      within(list).getByRole("button", { name: /title=Late/ }),
    ).toBeInTheDocument();
    expect(
      within(list).queryByRole("button", { name: /title=Early/ }),
    ).toBeNull();
    expect(
      within(list).queryByRole("button", { name: /title=Before/ }),
    ).toBeNull();
  });

  it("leaves the chip out while no hidden feature is in view", () => {
    show([placed(span("One", "2026-09-01", "2026-09-10"), 0)], {
      overflow: [span("Before", "2026-08-01", "2026-08-03")],
    });

    expect(chips()).toEqual([]);
  });
});
