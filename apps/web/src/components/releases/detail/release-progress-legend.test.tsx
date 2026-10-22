import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ReleaseProgressLegend } from "./release-progress-legend";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en-US" },
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));
afterEach(cleanup);

function scopeRow() {
  return within(screen.getByText("tasks:releases.chart.scope").closest("div")!);
}

function renderLegend(
  startScope: number | null | undefined,
  scope = 6,
  upcoming = false,
) {
  return render(
    <ReleaseProgressLegend
      counts={{ scope, started: 3, completed: 1 }}
      predicted={4.5}
      startScope={startScope}
      upcoming={upcoming}
    />,
  );
}

describe("release progress legend", () => {
  it("shows four current metrics and a signed scope-growth percentage", () => {
    renderLegend(4);
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      [
        "tasks:releases.chart.scope",
        "tasks:releases.chart.predicted",
        "tasks:releases.chart.started",
        "tasks:releases.chart.completed",
      ],
    );
    expect(scopeRow().getByText("6")).toBeVisible();
    expect(scopeRow().getByText("+50%")).toBeVisible();
    expect(
      scopeRow().getByText(
        'tasks:releases.chart.scopeGrowth:{"percent":"+50%"}',
      ),
    ).toHaveClass("sr-only");
    expect(screen.getByText("75%")).toBeVisible();
    expect(screen.getByText("50%")).toBeVisible();
    expect(screen.getByText("17%")).toBeVisible();
  });

  it("shows negative and unchanged net growth", () => {
    const view = renderLegend(12);
    expect(scopeRow().getByText("-50%")).toBeVisible();
    view.rerender(
      <ReleaseProgressLegend
        counts={{ scope: 6, started: 3, completed: 1 }}
        predicted={4.5}
        startScope={6}
        upcoming={false}
      />,
    );
    expect(scopeRow().getByText("0%")).toBeVisible();
  });

  it.each([1, 3])(
    "reports %s tasks added from a known zero baseline",
    (scope) => {
      renderLegend(0, scope);
      expect(
        scopeRow().getByText(
          `tasks:releases.chart.scopeAdded:{"count":${scope}}`,
        ),
      ).toBeVisible();
      expect(
        scopeRow().getByText(
          `tasks:releases.chart.scopeGrowthZeroBaseline:{"count":${scope}}`,
        ),
      ).toHaveClass("sr-only");
    },
  );

  it("shows zero percent when both the known baseline and current scope are zero", () => {
    renderLegend(0, 0);
    expect(scopeRow().getByText("0%")).toBeVisible();
  });

  it.each([null, undefined])(
    "keeps a %s baseline visibly unknown with an accessible explanation",
    (baseline) => {
      renderLegend(baseline);
      expect(scopeRow().getByText("—")).toBeVisible();
      expect(
        scopeRow().getByText("tasks:releases.chart.scopeGrowthUnknown"),
      ).toHaveClass("sr-only");
    },
  );

  it("explains the unavailable growth for upcoming releases", () => {
    renderLegend(4, 6, true);
    expect(scopeRow().getByText("—")).toBeVisible();
    expect(
      scopeRow().getByText("tasks:releases.chart.scopeGrowthUpcoming"),
    ).toHaveClass("sr-only");
  });
});
