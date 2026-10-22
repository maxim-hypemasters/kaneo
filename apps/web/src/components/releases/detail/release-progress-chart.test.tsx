import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ReleaseProgressHistory } from "@/types/release-progress";
import { ReleaseProgressChart } from "./release-progress-chart";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en-US" },
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

const release = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-21",
};
const history: ReleaseProgressHistory = {
  trackedFrom: "2026-10-05T00:00:00.000Z",
  today: "2026-10-07",
  startScope: null,
  current: { scope: 4, started: 3, completed: 1 },
  points: [
    { date: "2026-10-05", scope: 4, started: 1, completed: 0 },
    { date: "2026-10-06", scope: 4, started: 2, completed: 0 },
    { date: "2026-10-07", scope: 4, started: 3, completed: 1 },
  ],
};
beforeEach(() => {
  class TestPointerEvent extends MouseEvent {
    pointerType: string;
    constructor(type: string, options: PointerEventInit = {}) {
      super(type, options);
      this.pointerType = options.pointerType ?? "mouse";
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderChart(data = history) {
  return render(
    <ReleaseProgressChart release={release} history={data} timeZone="UTC" />,
  );
}

describe("ReleaseProgressChart", () => {
  it("plots smooth scope, predicted, started and completed with today's expected count", () => {
    const { container } = renderChart();
    expect(screen.getAllByRole("definition")).toHaveLength(8);
    expect(
      [...container.querySelectorAll("[data-series]")].map((path) =>
        path.getAttribute("data-series"),
      ),
    ).toEqual(["predicted", "scope", "started", "completed"]);
    for (const key of ["scope", "started", "completed"]) {
      const path = container.querySelector(`[data-series="${key}"]`);
      expect(path?.getAttribute("d")).toContain("C");
      expect(path?.getAttribute("d")).not.toContain("V");
    }
    expect(
      screen.getByText("tasks:releases.chart.predicted"),
    ).toBeInTheDocument();
    expect(screen.getByText("tasks:releases.chart.scope")).toBeInTheDocument();
    expect(
      container.querySelector('[data-series="scope"]'),
    ).not.toHaveAttribute("stroke-dasharray");
    expect(screen.getByText("1.7")).toBeInTheDocument();
    expect(screen.getByText("43%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(
      screen.getByText(/^tasks:releases.chart.trackingSince:/),
    ).toBeInTheDocument();
  });

  it("explores recorded days with arrows, Home and End, and dismisses with Escape", () => {
    renderChart();
    const chart = screen.getByRole("slider");
    fireEvent.focus(chart);
    expect(chart).toHaveAttribute("aria-valuenow", "2");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(chart).toHaveAttribute("aria-valuenow", "1");
    expect(chart.getAttribute("aria-valuetext")).toContain('"date":"Oct 6"');
    expect(chart.getAttribute("aria-valuetext")).toContain('"predicted":"1.4"');
    expect(chart.getAttribute("aria-valuetext")).toContain('"scope":4');
    expect(screen.getByText("1.4")).toBeInTheDocument();
    fireEvent.keyDown(chart, { key: "Home" });
    expect(chart).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(chart).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(chart, { key: "End" });
    expect(chart).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByText("Oct 7", { selector: "p" })).toBeInTheDocument();
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(
      screen.queryByText("Oct 7", { selector: "p" }),
    ).not.toBeInTheDocument();
  });

  it("selects the closest day with a pointer or touch and preserves the current legend", () => {
    renderChart();
    const chart = screen.getByRole("slider");
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      left: 0,
      right: 1000,
      top: 0,
      bottom: 190,
      height: 190,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(chart, { clientX: 250, pointerType: "touch" });
    fireEvent.focus(chart);
    expect(chart).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("75%")).toBeInTheDocument();
    fireEvent.pointerLeave(chart, { pointerType: "touch" });
    expect(chart).toHaveAttribute("aria-valuenow", "1");
    fireEvent.pointerMove(chart, { clientX: 200, pointerType: "mouse" });
    expect(chart).toHaveAttribute("aria-valuenow", "0");
  });

  it("explores historical scope without replacing the current scope or growth legend", () => {
    renderChart({
      ...history,
      trackedFrom: "2026-10-01T00:00:00.000Z",
      startScope: 2,
      points: history.points.map((point, index) => ({
        ...point,
        scope: index + 2,
      })),
    });
    const legendRow = screen
      .getByText("tasks:releases.chart.scope")
      .closest("div")!;
    const currentText = legendRow.textContent;
    expect(within(legendRow).getByText("4")).toBeVisible();
    expect(within(legendRow).getByText("+100%")).toBeVisible();
    const chart = screen.getByRole("slider");
    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: "Home" });
    expect(chart.getAttribute("aria-valuetext")).toContain('"scope":2');
    const tooltip = screen.getByText("Oct 5", { selector: "p" }).parentElement!;
    expect(
      within(tooltip).getByText("tasks:releases.chart.scope"),
    ).toBeInTheDocument();
    expect(within(tooltip).getByText("2")).toBeInTheDocument();
    expect(legendRow.textContent).toBe(currentText);
  });

  it("labels today and keeps submission inside a chart extended by late work", () => {
    const { container } = renderChart({
      ...history,
      today: "2026-10-25",
      points: [...history.points, { ...history.points[2], date: "2026-10-25" }],
    });
    expect(
      screen
        .getByText("tasks:releases.detail.today", { selector: "dt span" })
        .closest("div"),
    ).toHaveTextContent("Oct 25");
    expect(screen.getByText("tasks:releases.dates.codeFreeze")).toHaveClass(
      "sr-only",
    );
    expect(screen.getByText("tasks:releases.dates.submission")).toHaveClass(
      "sr-only",
    );
    const submission = container.querySelector('[data-marker="submission"]');
    expect(Number(submission?.getAttribute("x1"))).toBeLessThan(1000);
  });

  it("shows the complete predicted guideline while upcoming actual history stays blank", () => {
    const { container } = renderChart({
      ...history,
      today: "2026-09-30",
      points: [],
    });
    expect(
      screen.getByText("tasks:releases.chart.upcoming"),
    ).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveAttribute("tabindex", "-1");
    expect(
      container.querySelector('[data-series="predicted"]'),
    ).toHaveAttribute("d", "M0,160L700,20");
    expect(container.querySelector('[data-series="started"]')).toHaveAttribute(
      "d",
      "",
    );
    expect(
      container.querySelector('[data-series="completed"]'),
    ).toHaveAttribute("d", "");
    expect(container.querySelector('[data-series="scope"]')).toHaveAttribute(
      "d",
      "",
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("shows an empty release without division by zero", () => {
    renderChart({
      ...history,
      current: { scope: 0, started: 0, completed: 0 },
      points: [{ date: "2026-10-07", scope: 0, started: 0, completed: 0 }],
    });
    expect(screen.getByText("tasks:releases.chart.empty")).toBeInTheDocument();
    expect(screen.getAllByText("0%")).toHaveLength(3);
  });
});
