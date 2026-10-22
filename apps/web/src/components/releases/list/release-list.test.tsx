import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import type { Release } from "@/types/release";
import { ReleaseList } from "./release-list";

const progress = vi.hoisted(() => vi.fn());
const scroll = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
  if (options.top !== undefined) this.scrollTop = options.top;
});

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "en-US", language: "en-US" },
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    className,
    title,
  }: {
    children: ReactNode;
    params: { workspaceId: string; projectId: string; releaseId: string };
    className?: string;
    title?: string;
  }) => (
    <a
      href={`/dashboard/workspace/${params.workspaceId}/project/${params.projectId}/releases/${params.releaseId}`}
      className={className}
      title={title}
    >
      {children}
    </a>
  ),
}));
vi.mock("../detail/release-progress-section", () => ({
  ReleaseProgressSection: ({
    release,
    presentation,
  }: {
    release: Release;
    presentation: string;
  }) => {
    progress(release.id);
    return (
      <section
        aria-label={`History ${release.name}`}
        data-project-id={release.projectId}
        data-presentation={presentation}
      />
    );
  },
}));
vi.mock("../release-actions-menu", () => ({
  ReleaseActionsMenu: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: scroll,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockTimelineGeometry() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      let top = 100;
      if (this.tagName === "LI") {
        const list = this.parentElement;
        const viewport = list?.parentElement;
        const index = Array.from(list?.children ?? []).indexOf(this);
        top += index * 64 - (viewport?.scrollTop ?? 0);
      }
      return {
        x: 0,
        y: top,
        top,
        bottom: top + 64,
        left: 0,
        right: 800,
        width: 800,
        height: 64,
        toJSON: () => ({}),
      };
    },
  );
}

function release(
  id: string,
  startDate = "2026-10-01",
  submissionDate = "2026-10-30",
): Release {
  return {
    id,
    projectId: "p",
    name: id,
    description: null,
    startDate,
    codeFreezeDate: submissionDate,
    submissionDate,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    progress: {
      tasks: { total: 2, completed: 1 },
      features: { total: 0, completed: 0 },
      unfinished: 1,
    },
  };
}

function Timeline({
  releases,
  today = "2026-10-21",
  counts,
}: {
  releases: Release[];
  today?: string;
  counts?: ReadonlyMap<string, ReleaseItemCounts>;
}) {
  return (
    <ReleaseList
      workspaceId="w"
      releases={releases}
      today={today}
      emptyState={<p>No releases yet</p>}
      counts={
        counts ??
        new Map(
          releases.map((item) => [
            item.id,
            {
              tasks: 2,
              completedTasks: 1,
              features: 0,
              completedFeatures: 0,
              unfinished: 1,
            },
          ]),
        )
      }
      permissions={{
        canManage: false,
        canMoveItems: false,
        canDelete: false,
        canCreateTasks: false,
      }}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMoveUnfinished={vi.fn()}
    />
  );
}

describe("automatic release overview", () => {
  it("opens at the first active row below many upcoming releases without focusing its link", () => {
    mockTimelineGeometry();
    const upcoming = Array.from({ length: 12 }, (_, index) =>
      release(`future-${index}`, "2026-11-01", "2026-11-30"),
    );
    render(
      <Timeline
        releases={[
          ...upcoming,
          release("in-progress", "2026-10-01", "2026-10-30"),
          {
            ...release("code-freeze", "2026-10-10", "2026-10-25"),
            codeFreezeDate: "2026-10-20",
          },
        ]}
      />,
    );

    const viewport = screen.getByRole("list").parentElement;
    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      top: 12 * 64,
      behavior: "instant",
    });
    expect(scroll.mock.contexts[0]).toBe(viewport);
    expect(viewport?.scrollTop).toBe(12 * 64);
    expect(screen.getByRole("link", { name: "code-freeze" })).not.toHaveFocus();
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("preserves manual scrolling through refreshes, date edits, and local-day changes", () => {
    mockTimelineGeometry();
    const active = release("active");
    const future = release("future", "2026-11-01", "2026-11-30");
    const { rerender } = render(<Timeline releases={[future, active]} />);
    const viewport = screen.getByRole("list").parentElement!;
    viewport.scrollTop = 320;

    rerender(<Timeline releases={[{ ...future }, { ...active }]} />);
    rerender(
      <Timeline
        releases={[future, { ...active, submissionDate: "2026-10-29" }]}
        today="2026-10-22"
      />,
    );
    rerender(<Timeline releases={[future]} today="2026-10-31" />);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(viewport.scrollTop).toBe(320);
  });

  it("stays at the top when entry has no active releases and does not jump when one later becomes active", () => {
    mockTimelineGeometry();
    const future = release("future", "2026-11-01", "2026-11-30");
    const { rerender } = render(<Timeline releases={[future]} />);
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByRole("list").parentElement?.scrollTop).toBe(0);

    rerender(<Timeline releases={[future]} today="2026-11-01" />);
    expect(
      screen.getByRole("region", { name: "History future" }),
    ).toBeVisible();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("does not jump when work is added after an initially empty overview", () => {
    mockTimelineGeometry();
    const { rerender } = render(<Timeline releases={[]} />);
    rerender(
      <Timeline
        releases={[
          release("future", "2026-11-01", "2026-11-30"),
          release("active"),
        ]}
      />,
    );
    expect(
      screen.getByRole("region", { name: "History active" }),
    ).toBeVisible();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("positions a fresh page entry independently when the project scope changes", () => {
    mockTimelineGeometry();
    const future = release("future", "2026-11-01", "2026-11-30");
    const { rerender } = render(
      <Timeline
        key="workspace/project"
        releases={[future, release("active")]}
      />,
    );
    const firstViewport = screen.getByRole("list").parentElement!;
    firstViewport.scrollTop = 320;

    rerender(
      <Timeline
        key="workspace/other-project"
        releases={[
          { ...future, projectId: "other-project" },
          { ...release("active"), projectId: "other-project" },
        ]}
      />,
    );
    const secondViewport = screen.getByRole("list").parentElement;
    expect(secondViewport).not.toBe(firstViewport);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.mock.contexts[1]).toBe(secondViewport);
    expect(secondViewport?.scrollTop).toBe(64);
  });

  it("renders a continuous phase-ordered timeline with active history and no disclosure controls", () => {
    render(
      <Timeline
        releases={[
          release("past", "2026-09-01", "2026-09-30"),
          release("active"),
          release("future", "2026-11-01", "2026-11-30"),
        ]}
      />,
    );
    expect(screen.getAllByRole("list")).toHaveLength(1);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["future", "active", "past"],
    );
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "History active" }),
    ).toHaveAttribute("data-presentation", "overview");
    expect(progress).toHaveBeenCalledExactlyOnceWith("active");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByText("50% · 1/2")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "active" })).toHaveAttribute(
      "href",
      "/dashboard/workspace/w/project/p/releases/active",
    );
  });

  it("shows every simultaneous In Progress and Code freeze release with a chart", () => {
    render(
      <Timeline
        releases={[
          release("in-progress", "2026-10-01", "2026-10-30"),
          {
            ...release("code-freeze", "2026-10-10", "2026-10-25"),
            codeFreezeDate: "2026-10-20",
          },
          release("upcoming", "2026-11-01", "2026-11-30"),
        ]}
      />,
    );
    expect(
      screen
        .getAllByRole("region")
        .map((region) => region.getAttribute("aria-label")),
    ).toEqual(["History code-freeze", "History in-progress"]);
    expect(progress.mock.calls.map(([id]) => id)).toEqual([
      "code-freeze",
      "in-progress",
    ]);
  });

  it("keeps future and past releases mini without mounting any history when none is active", () => {
    render(
      <Timeline
        releases={[
          release("past", "2026-09-01", "2026-09-30"),
          release("future", "2026-11-01", "2026-11-30"),
        ]}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(progress).not.toHaveBeenCalled();
  });

  it("automatically starts a chart on the start day, keeps it through code freeze and submission, then removes it", () => {
    const item = {
      ...release("boundary", "2026-10-21", "2026-10-25"),
      codeFreezeDate: "2026-10-23",
    };
    const { rerender } = render(
      <Timeline releases={[item]} today="2026-10-20" />,
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    rerender(<Timeline releases={[item]} today="2026-10-21" />);
    expect(
      screen.getByRole("region", { name: "History boundary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("tasks:releases.phase.inProgress"),
    ).toBeInTheDocument();
    rerender(<Timeline releases={[item]} today="2026-10-23" />);
    expect(
      screen.getByRole("region", { name: "History boundary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("tasks:releases.phase.codeFreeze"),
    ).toBeInTheDocument();
    rerender(<Timeline releases={[item]} today="2026-10-25" />);
    expect(
      screen.getByRole("region", { name: "History boundary" }),
    ).toBeInTheDocument();
    rerender(<Timeline releases={[item]} today="2026-10-26" />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("recomputes active presentation when release dates change without remounting the list", () => {
    const { rerender } = render(
      <Timeline releases={[release("edited", "2026-11-01", "2026-11-30")]} />,
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    rerender(<Timeline releases={[release("edited")]} />);
    expect(
      screen.getByRole("region", { name: "History edited" }),
    ).toBeInTheDocument();
    rerender(
      <Timeline releases={[release("edited", "2026-09-01", "2026-09-30")]} />,
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("keeps all active histories through refetches and removes only the deleted release", () => {
    const first = release("first");
    const second = release("second", "2026-10-10", "2026-10-25");
    const { rerender } = render(<Timeline releases={[first]} />);
    rerender(<Timeline releases={[{ ...first }, second]} />);
    expect(screen.getAllByRole("region")).toHaveLength(2);
    rerender(<Timeline releases={[second]} />);
    expect(
      screen.queryByRole("region", { name: "History first" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "History second" }),
    ).toBeInTheDocument();
  });

  it("shows the empty state and automatically shows active work arriving after an empty result", () => {
    const { rerender } = render(<Timeline releases={[]} />);
    expect(screen.getByText("No releases yet")).toBeInTheDocument();
    rerender(<Timeline releases={[release("first")]} />);
    expect(
      screen.getByRole("region", { name: "History first" }),
    ).toBeInTheDocument();
    rerender(<Timeline releases={[]} />);
    expect(screen.getByText("No releases yet")).toBeInTheDocument();
    rerender(<Timeline releases={[release("second")]} />);
    expect(
      screen.getByRole("region", { name: "History second" }),
    ).toBeInTheDocument();
  });

  it("uses the new project's dates and history even when the release ID is reused", () => {
    const { rerender } = render(
      <Timeline releases={[release("reused", "2026-11-01", "2026-11-30")]} />,
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    rerender(
      <Timeline releases={[{ ...release("reused"), projectId: "other" }]} />,
    );
    expect(
      screen.getByRole("region", { name: "History reused" }),
    ).toHaveAttribute("data-project-id", "other");
  });

  it("keeps the zero-count fallback for missing aggregates", () => {
    render(<Timeline releases={[release("empty")]} counts={new Map()} />);
    expect(screen.getByText("0% · 0/0")).toBeInTheDocument();
  });
});
