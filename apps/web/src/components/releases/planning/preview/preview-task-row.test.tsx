import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { buildGanttTimeline } from "@/components/gantt/timeline";
import type { ReleasePlanTask } from "@/types/release-plan";
import { previewTask, releasePreview } from "./preview-fixtures";
import { previewModel } from "./preview-model";
import { PreviewTaskRow } from "./preview-task-row";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);

const title = "Keep the full split-work task title";
function row(dayWidthRem: number, overrides: Partial<ReleasePlanTask> = {}) {
  const start = new Date(2026, 9, 26, 9);
  const end = new Date(2026, 9, 27, 13);
  const task = previewModel(
    releasePreview([
      previewTask("split", {
        title,
        start: start.toISOString(),
        end: end.toISOString(),
        segments: [
          {
            start: start.toISOString(),
            end: new Date(2026, 9, 26, 17).toISOString(),
          },
          {
            start: new Date(2026, 9, 27, 9).toISOString(),
            end: end.toISOString(),
          },
        ],
        ...overrides,
      }),
    ]),
    "project",
  ).scheduled[0];
  const timeline = buildGanttTimeline(
    { start: new Date(2026, 9, 26), end: new Date(2026, 9, 28) },
    dayWidthRem,
  );
  return (
    <PreviewTaskRow task={task} timeline={timeline} dayWidthRem={dayWidthRem} />
  );
}

describe("release preview task cards", () => {
  it("fills a single date column for a short Bug and shows its identifier on the card", () => {
    const start = new Date(2026, 9, 27, 9).toISOString();
    const end = new Date(2026, 9, 27, 13).toISOString();
    render(row(2.5, { type: "bug", start, end, segments: [{ start, end }] }));

    const bar = screen.getByRole("button", { name: new RegExp(title) });
    expect(bar.style.left).toBe("2.5rem");
    expect(bar.style.width).toBe("2.5rem");
    expect(within(bar).getByText("EPD-split")).toBeVisible();
    expect(bar.querySelector("[data-gantt-work-segment]")).toBeNull();
    expect(bar.querySelector("[data-gantt-card-surface]")).toBeNull();
  });

  it("uses one card across split work and adds its inline title as zoom permits", () => {
    const view = render(row(2.5));
    const bar = screen.getByRole("button", { name: new RegExp(title) });
    expect(bar.style.left).toBe("0rem");
    expect(bar.style.width).toBe("5rem");
    expect(
      screen.getAllByRole("button", { name: new RegExp(title) }),
    ).toHaveLength(1);
    expect(within(bar).queryByText(title)).not.toBeInTheDocument();
    expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(bar).not.toHaveAttribute("title");
    expect(bar).not.toHaveAccessibleName(/2026/);
    expect(bar.querySelector("[data-gantt-work-segment]")).toBeNull();
    view.rerender(row(8));
    expect(within(bar).getByText(title)).toBeVisible();
    expect(bar.style.width).toBe("16rem");
  });

  it.each(["task", "bug"] as const)(
    "shows the %s name, milestone, and Feature in its popup without schedule dates",
    async (type) => {
      render(
        row(2.5, {
          type,
          milestoneTitle: "Core milestone",
          featureTitle: "Chat Feature",
        }),
      );
      const bar = screen.getByRole("button", { name: new RegExp(title) });
      fireEvent.click(bar);
      const popup = await screen.findByRole("dialog", { name: title });
      expect(within(popup).getByRole("heading", { name: title })).toBeVisible();
      expect(within(popup).getByText("Core milestone")).toBeVisible();
      expect(within(popup).getByText("Chat Feature")).toBeVisible();
      expect(popup).not.toHaveTextContent(/2026|09:00|13:00|UTC|GMT/);
      expect(bar).not.toHaveAttribute("title");
    },
  );

  it("omits unavailable milestone and Feature metadata without adding placeholder copy", async () => {
    render(row(2.5, { milestoneTitle: null, featureTitle: null }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
    const popup = await screen.findByRole("dialog", { name: title });
    expect(popup).toHaveTextContent(title);
    expect(popup.textContent).toBe(title);
  });
});
