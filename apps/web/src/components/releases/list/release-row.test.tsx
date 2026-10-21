import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { Release } from "@/types/release";
import { ReleaseRow } from "./release-row";

const mocks = vi.hoisted(() => ({
  explore: vi.fn(),
  edit: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (
      key: string,
      args?: {
        name?: string;
        percentage?: number;
        completed?: number;
        total?: number;
      },
    ) =>
      args?.percentage !== undefined
        ? `${key}: ${args.percentage}% ${args.completed}/${args.total}`
        : args?.name
          ? `${key}: ${args.name}`
          : key,
    i18n: { resolvedLanguage: "en-US", language: "en-US" },
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    title,
  }: {
    children: ReactNode;
    className?: string;
    title?: string;
  }) => (
    <a href="/release" className={className} title={title}>
      {children}
    </a>
  ),
}));
vi.mock("../detail/release-progress-section", () => ({
  ReleaseProgressSection: ({ presentation }: { presentation: string }) => (
    <div data-testid="chart" data-presentation={presentation}>
      <button type="button" onClick={mocks.explore}>
        Explore chart
      </button>
    </div>
  ),
}));
vi.mock("../release-actions-menu", () => ({
  ReleaseActionsMenu: ({
    permissions,
    onEdit,
    onDelete,
    onMoveUnfinished,
  }: {
    permissions: {
      canManage: boolean;
      canDelete: boolean;
      canMoveItems: boolean;
    };
    onEdit: () => void;
    onDelete: () => void;
    onMoveUnfinished?: () => void;
  }) => (
    <div>
      {permissions.canManage && (
        <button type="button" onClick={onEdit}>
          Edit release
        </button>
      )}
      {permissions.canDelete && (
        <button type="button" onClick={onDelete}>
          Delete release
        </button>
      )}
      {permissions.canMoveItems && onMoveUnfinished && (
        <button type="button" onClick={onMoveUnfinished}>
          Move unfinished
        </button>
      )}
    </div>
  ),
}));

const release: Release = {
  id: "r1",
  projectId: "project-1",
  name: "2.4",
  description: null,
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  progress: {
    tasks: { total: 0, completed: 0 },
    features: { total: 0, completed: 0 },
    unfinished: 0,
  },
};
type RowProps = ComponentProps<typeof ReleaseRow>;
const counts: RowProps["counts"] = {
  tasks: 2,
  completedTasks: 1,
  features: 0,
  completedFeatures: 0,
  unfinished: 1,
};
const permissions: RowProps["permissions"] = {
  canManage: false,
  canMoveItems: false,
  canDelete: false,
  canCreateTasks: false,
};
function Harness({ overrides = {} }: { overrides?: Partial<RowProps> }) {
  return (
    <ul>
      <ReleaseRow
        release={release}
        counts={counts}
        today="2026-10-17"
        workspaceId="workspace-1"
        permissions={permissions}
        onEdit={mocks.edit}
        onDelete={mocks.remove}
        onMoveUnfinished={mocks.move}
        {...overrides}
      />
    </ul>
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("release timeline row", () => {
  it("shows only the localized submission date on the rail with its full date available", () => {
    const { container } = render(<Harness />);
    const times = container.querySelectorAll("time");
    expect(times).toHaveLength(1);
    const time = times[0];
    expect(time).toHaveAttribute("datetime", "2026-10-20");
    expect(time).toHaveAttribute("title", "October 20, 2026");
    expect(time.querySelector(".sr-only")).toHaveTextContent(
      "tasks:releases.dates.submission: October 20, 2026",
    );
    expect(time).toHaveTextContent("Oct");
    expect(time).toHaveTextContent("20");
    expect(time.querySelector('[aria-hidden="true"]')).not.toHaveTextContent(
      "2026",
    );
    expect(container.querySelector('time[datetime="2026-10-01"]')).toBeNull();
    expect(container.querySelector('time[datetime="2026-10-15"]')).toBeNull();
    expect(screen.queryByTitle("October 1, 2026")).not.toBeInTheDocument();
    expect(screen.queryByTitle("October 15, 2026")).not.toBeInTheDocument();
  });

  it("shows the year when the submission date falls outside the current year", () => {
    const { container } = render(
      <Harness
        overrides={{
          release: {
            ...release,
            startDate: "2025-12-01",
            codeFreezeDate: "2025-12-15",
            submissionDate: "2025-12-20",
          },
        }}
      />,
    );
    expect(
      container.querySelector('time [aria-hidden="true"]'),
    ).toHaveTextContent("2025");
    expect(container.querySelector("time")).toHaveAttribute(
      "datetime",
      "2025-12-20",
    );
    expect(container.querySelector("time")).toHaveAttribute(
      "title",
      "December 20, 2025",
    );
  });

  it("keeps the active chart visible without disclosure and leaves the title and chart controls independent", () => {
    render(<Harness />);
    const link = screen.getByRole("link", { name: "2.4" });
    expect(link).not.toHaveClass("after:absolute", "after:inset-0");
    expect(screen.getByTestId("chart")).toHaveAttribute(
      "data-presentation",
      "overview",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { expanded: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { expanded: false }),
    ).not.toBeInTheDocument();
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(mocks.explore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Explore chart" }));
    expect(mocks.explore).toHaveBeenCalledOnce();
    expect(screen.getByTestId("chart")).toBeVisible();
  });

  it.each([
    ["2026-09-30", false, "upcoming"],
    ["2026-10-01", true, "inProgress"],
    ["2026-10-14", true, "inProgress"],
    ["2026-10-15", true, "codeFreeze"],
    ["2026-10-20", true, "codeFreeze"],
    ["2026-10-21", false, "pastSubmission"],
  ] as const)(
    "shows a full row only while active on %s",
    (today, active, phase) => {
      render(<Harness overrides={{ today }} />);
      expect(screen.getByText(`tasks:releases.phase.${phase}`)).toBeVisible();
      if (active) {
        expect(screen.getByTestId("chart")).toBeVisible();
      } else {
        expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
      }
    },
  );

  it("keeps title and chart controls keyboard accessible and exposes completion totals", () => {
    render(<Harness />);
    const link = screen.getByRole("link", { name: "2.4" });
    link.focus();
    expect(link).toHaveFocus();
    const chartControl = screen.getByRole("button", { name: "Explore chart" });
    expect(chartControl).toHaveAttribute("type", "button");
    expect(chartControl.tabIndex).toBe(0);
    chartControl.focus();
    expect(chartControl).toHaveFocus();
    expect(
      screen.getByRole("img", {
        name: "tasks:releases.timeline.completion: 50% 1/2",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("50% · 1/2")).toBeVisible();
  });

  it("shows zero completion for empty work", () => {
    render(
      <Harness
        overrides={{
          counts: { ...counts, tasks: 0, completedTasks: 0, unfinished: 0 },
        }}
      />,
    );
    expect(screen.getByText("0% · 0/0")).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "tasks:releases.timeline.completion: 0% 0/0",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the past-submission phase even when work remains or is complete", () => {
    const view = render(<Harness overrides={{ today: "2026-10-21" }} />);
    expect(
      screen.getByText("tasks:releases.phase.pastSubmission"),
    ).toBeVisible();
    view.rerender(
      <Harness
        overrides={{
          today: "2026-10-21",
          counts: { ...counts, completedTasks: 2, unfinished: 0 },
        }}
      />,
    );
    expect(
      screen.getByText("tasks:releases.phase.pastSubmission"),
    ).toBeVisible();
    expect(screen.getByText("100% · 2/2")).toBeVisible();
  });

  it("preserves permission-gated actions independently of the chart", () => {
    const view = render(<Harness />);
    expect(
      screen.queryByRole("button", { name: "Edit release" }),
    ).not.toBeInTheDocument();
    view.rerender(
      <Harness
        overrides={{
          permissions: {
            ...permissions,
            canManage: true,
            canDelete: true,
            canMoveItems: true,
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit release" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete release" }));
    fireEvent.click(screen.getByRole("button", { name: "Move unfinished" }));
    expect(mocks.edit).toHaveBeenCalledExactlyOnceWith(release);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(release);
    expect(mocks.move).toHaveBeenCalledExactlyOnceWith(release);
    expect(mocks.explore).not.toHaveBeenCalled();
    expect(screen.getByTestId("chart")).toBeVisible();
  });

  it("retains long titles for hover while allowing mobile metrics to wrap", () => {
    const name =
      "A long release name that must not push the metrics and controls out of the viewport";
    render(<Harness overrides={{ release: { ...release, name } }} />);
    const link = screen.getByRole("link", { name });
    expect(link).toHaveAttribute("title", name);
    expect(link).toHaveClass("truncate", "min-w-0");
    expect(screen.getByRole("img").parentElement).toHaveClass("flex-wrap");
  });
});
