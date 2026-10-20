import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import { ReleaseFeatureGroup } from "./release-feature-group";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === "tasks:releases.detail.progressInRelease")
        return `${values?.percentage}% · ${values?.completed}/${values?.total} completed in this release`;
      return key;
    },
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    "aria-describedby": describedBy,
  }: {
    children: ReactNode;
    className?: string;
    "aria-describedby"?: string;
  }) => (
    <a href="/task" className={className} aria-describedby={describedBy}>
      {children}
    </a>
  ),
}));

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    number: 1,
    status: "to-do",
    projectId: "project-1",
    type: "task",
    featureId: null,
    releaseId: "r1",
    ...values,
  }) as Task;

const columns = new Map([
  ["to-do", { name: "To Do" }],
  ["done", { name: "Done" }],
]);

function renderGroup(feature: Task) {
  render(
    <ReleaseFeatureGroup
      group={{
        feature,
        inRelease: true,
        tasks: [task("Cart", { featureId: feature.id, status: "done" })],
        tasksElsewhere: 0,
      }}
      workspaceId="workspace-1"
      releaseId="r1"
      projectSlug="KAN"
      columns={columns}
      done={new Set(["done"])}
      started={new Set(["in-progress"])}
      milestones={[]}
      progressReady
    />,
  );
}

afterEach(cleanup);

describe("ReleaseFeatureGroup", () => {
  it("says a finished feature is done in text, not only by strike-through", () => {
    renderGroup(task("Checkout", { type: "feature", status: "done" }));

    expect(screen.getByRole("region", { name: "Checkout" })).toBeVisible();
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("Checkout");
    expect(heading).toHaveTextContent("Done");
    expect(
      screen.getByRole("link", { name: "Checkout" }),
    ).toHaveAccessibleDescription("Done");
  });

  it("names an open feature's column, or Planned for one on no column", () => {
    renderGroup(task("Checkout", { type: "feature" }));
    expect(
      screen.getByRole("link", { name: "Checkout" }),
    ).toHaveAccessibleDescription("To Do");
    cleanup();

    renderGroup(task("Search", { type: "feature", status: "planned" }));
    expect(
      screen.getByRole("link", { name: "Search" }),
    ).toHaveAccessibleDescription("tasks:status.planned");
  });

  const groupProps = {
    workspaceId: "workspace-1",
    releaseId: "r1",
    projectSlug: "KAN",
    columns,
    done: new Set(["done"]),
    started: new Set(["in-progress"]),
    progressReady: true,
  };
  const feature = task("Checkout", { type: "feature", status: "done" });
  const group = {
    feature,
    inRelease: false,
    tasks: [
      task("Bug", {
        type: "bug",
        featureId: feature.id,
        status: "done",
        milestoneId: "m2",
      }),
      task("Task", { featureId: feature.id, milestoneId: "m1" }),
      task("Unassigned", { featureId: feature.id }),
    ],
    tasksElsewhere: 5,
  };
  const milestones = [
    { id: "m2", featureId: feature.id, title: "Ship", position: 2 },
    { id: "empty", featureId: feature.id, title: "Empty", position: 0 },
    { id: "m1", featureId: feature.id, title: "Build", position: 1 },
  ];

  it("shows release-only progress independent of the Feature status and keeps outside-release information", () => {
    render(
      <ReleaseFeatureGroup {...groupProps} group={group} milestones={[]} />,
    );
    expect(
      screen.getByRole("img", { name: "33% · 1/3 completed in this release" }),
    ).toBeVisible();
    expect(
      screen.getByText("tasks:releases.detail.featureElsewhere"),
    ).toBeVisible();
    expect(
      screen.getByText("tasks:releases.detail.tasksElsewhere"),
    ).toBeVisible();
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
  });

  it("renders ordered expanded milestone groups, hides empty definitions, and places unassigned work last", () => {
    render(
      <ReleaseFeatureGroup
        {...groupProps}
        group={group}
        milestones={milestones}
      />,
    );
    expect(
      screen
        .getAllByRole("heading", { level: 4 })
        .map((heading) => heading.textContent),
    ).toEqual(["Build", "Ship", "tasks:milestones.none"]);
    const build = screen.getByRole("region", { name: "Build" });
    expect(within(build).getByRole("link", { name: /Task/ })).toHaveClass(
      "pl-10",
      "sm:pl-12",
    );
    expect(
      within(build).getByRole("img", {
        name: "0% · 0/1 completed in this release",
      }),
    ).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Ship" })).getByRole("img", {
        name: "100% · 1/1 completed in this release",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Empty")).not.toBeInTheDocument();
  });

  it("shows a No milestone group when the Feature owns an empty milestone", () => {
    render(
      <ReleaseFeatureGroup
        {...groupProps}
        group={{ ...group, tasks: [task("Unassigned")] }}
        milestones={milestones}
      />,
    );
    expect(
      screen
        .getAllByRole("heading", { level: 4 })
        .map((heading) => heading.textContent),
    ).toEqual(["tasks:milestones.none"]);
  });

  it.each([
    undefined,
    [{ id: "empty", featureId: feature.id, title: "Empty", position: 0 }],
  ])(
    "keeps all work visible in a flat list for unavailable or inconsistent definitions",
    (metadata) => {
      render(
        <ReleaseFeatureGroup
          {...groupProps}
          group={group}
          milestones={metadata}
        />,
      );
      expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
      expect(screen.getAllByRole("link")).toHaveLength(4);
    },
  );

  it("shows placeholders while the board snapshot is incomplete, without partial progress or active diamonds", () => {
    const { container } = render(
      <ReleaseFeatureGroup
        {...groupProps}
        group={group}
        milestones={milestones}
        progressReady={false}
      />,
    );
    expect(
      screen.getAllByRole("status", {
        name: "tasks:releases.detail.progressLoading",
      }),
    ).toHaveLength(4);
    expect(
      screen.queryByRole("img", { name: /completed in this release/ }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".text-amber-500, .fill-primary"),
    ).toBeNull();
  });

  it("shows 0% for an empty Feature", () => {
    render(
      <ReleaseFeatureGroup
        {...groupProps}
        group={{ ...group, tasks: [] }}
        milestones={milestones}
      />,
    );
    expect(
      screen.getByRole("img", { name: "0% · 0/0 completed in this release" }),
    ).toBeVisible();
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
  });

  it("uses neutral, active, and completed diamond styling from release work", () => {
    render(
      <ReleaseFeatureGroup
        {...groupProps}
        group={{
          ...group,
          tasks: [
            ...group.tasks,
            task("Started", { milestoneId: "m1", status: "in-progress" }),
          ],
        }}
        milestones={milestones}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "Build" }))
        .getByRole("heading")
        .querySelector("svg"),
    ).toHaveClass("text-amber-500");
    expect(
      within(screen.getByRole("region", { name: "Ship" }))
        .getByRole("heading")
        .querySelector("svg"),
    ).toHaveClass("fill-primary", "text-primary");
    expect(
      within(screen.getByRole("region", { name: "tasks:milestones.none" }))
        .getByRole("heading")
        .querySelector("svg"),
    ).toHaveClass("text-muted-foreground");
  });
});
