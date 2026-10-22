import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type Task from "@/types/task";
import { ReleaseFeatureGroup } from "./release-feature-group";
import { ReleaseMilestoneSection } from "./release-milestone-section";
import type {
  ReleaseMilestoneGroup,
  ReleaseMilestoneMetadata,
} from "./release-milestone-groups";

const openDetails = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === "tasks:gantt.showTasks") return "Show tasks";
      if (key === "tasks:gantt.hideTasks") return "Hide tasks";
      if (key === "tasks:milestones.none") return "No milestone";
      if (key === "tasks:releases.detail.progressInRelease")
        return `${values?.percentage}% · ${values?.completed}/${values?.total} completed in this release`;
      return key;
    },
  }),
}));
vi.mock("@/store/milestone-details", () => ({
  openMilestoneDetails: openDetails,
}));
vi.mock("@/lib/i18n/domain", () => ({
  getStatusDisplayLabel: (status: string) => status,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <a href="/task" className={className}>
      {children}
    </a>
  ),
}));

const task = (id: string, type: "task" | "bug" = "task", status = "done") =>
  ({
    id,
    title: id,
    number: type === "task" ? 1 : 2,
    projectId: "project-1",
    type,
    status,
    featureId: "feature-1",
    milestoneId: "milestone-1",
    releaseId: "release-1",
  }) as Task;

const milestone: ReleaseMilestoneMetadata = {
  id: "milestone-1",
  featureId: "feature-1",
  title: "Completed milestone",
  position: 0,
  status: "done",
};
const completedWork = [task("Completed task"), task("Completed bug", "bug")];
const props = {
  projectId: "project-1",
  workspaceId: "workspace-1",
  releaseId: "release-1",
  projectSlug: "KAN",
  columns: new Map([
    ["to-do", { name: "To Do" }],
    ["done", { name: "Done" }],
  ]),
  done: new Set(["done"]),
  started: new Set(["in-progress"]),
  progressReady: true,
};
const group = (
  metadata: ReleaseMilestoneMetadata | null = milestone,
  tasks = completedWork,
): ReleaseMilestoneGroup => ({ milestone: metadata, tasks });
const workLinks = () =>
  screen.queryAllByRole("link", { name: /Completed (task|bug)/ });

beforeEach(() => {
  openDetails.mockReset();
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});
afterEach(cleanup);

describe("release milestone disclosure", () => {
  it("starts collapsed and strikes through the milestone title while retaining its counter", () => {
    render(<ReleaseMilestoneSection {...props} group={group()} />);

    expect(workLinks()).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Show tasks/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: milestone.title })).toHaveClass(
      "line-through",
    );
    expect(
      screen.getByRole("img", { name: "100% · 2/2 completed in this release" }),
    ).toBeVisible();
  });

  it("expands Tasks and Bugs and collapses them again without changing progress", async () => {
    render(<ReleaseMilestoneSection {...props} group={group()} />);
    const toggle = screen.getByRole("button", { name: /^Show tasks/ });
    fireEvent.click(toggle);
    const panelId = toggle.getAttribute("aria-controls");

    expect(screen.getByRole("button", { name: /^Hide tasks/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(workLinks()).toHaveLength(2);
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeVisible();
    expect(screen.getByRole("button", { name: milestone.title })).toHaveClass(
      "line-through",
    );
    fireEvent.click(screen.getByRole("button", { name: /^Hide tasks/ }));
    await waitFor(() => expect(workLinks()).toHaveLength(0));
    expect(
      screen.getByRole("img", { name: "100% · 2/2 completed in this release" }),
    ).toBeVisible();
  });

  it("keeps the disclosure keyboard focusable and accepts its native keyboard click", () => {
    render(<ReleaseMilestoneSection {...props} group={group()} />);
    const toggle = screen.getByRole("button", { name: /^Show tasks/ });
    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.keyDown(toggle, { key: "Enter", code: "Enter" });
    fireEvent.keyUp(toggle, { key: "Enter", code: "Enter" });
    // jsdom does not synthesize native button activation from keyboard events.
    fireEvent.click(toggle, { detail: 0 });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveFocus();
    expect(workLinks()).toHaveLength(2);
  });

  it("keeps opening milestone details separate from expanding work", () => {
    render(<ReleaseMilestoneSection {...props} group={group()} />);
    fireEvent.click(screen.getByRole("button", { name: milestone.title }));

    expect(openDetails).toHaveBeenCalledExactlyOnceWith(
      "project-1",
      milestone.id,
    );
    expect(workLinks()).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Show tasks/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it.each(["to-do", "in-progress"] as const)(
    "starts a %s milestone collapsed and allows expansion without crossing out its title",
    (status) => {
      render(
        <ReleaseMilestoneSection
          {...props}
          group={group({ ...milestone, status })}
        />,
      );
      expect(workLinks()).toHaveLength(0);
      expect(
        screen.getByRole("button", { name: /^Show tasks/ }),
      ).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.getByRole("button", { name: milestone.title }),
      ).not.toHaveClass("line-through");
      fireEvent.click(screen.getByRole("button", { name: /^Show tasks/ }));
      expect(workLinks()).toHaveLength(2);
      expect(
        screen.getByRole("button", { name: /^Hide tasks/ }),
      ).toHaveAttribute("aria-expanded", "true");
    },
  );

  it("keeps No milestone work expanded without completion styling or disclosure", () => {
    render(<ReleaseMilestoneSection {...props} group={group(null)} />);

    expect(workLinks()).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /^Show tasks/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No milestone")).not.toHaveClass("line-through");
  });

  it("preserves manual expansion across metadata refreshes and renaming", () => {
    const view = render(<ReleaseMilestoneSection {...props} group={group()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Show tasks/ }));
    view.rerender(
      <ReleaseMilestoneSection
        {...props}
        group={group({ ...milestone, title: "Renamed milestone" }, [
          ...completedWork,
        ])}
      />,
    );

    expect(screen.getByRole("button", { name: /^Hide tasks/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(workLinks()).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Renamed milestone" }),
    ).toHaveClass("line-through");
  });

  it("preserves disclosure choices across status changes while updating completion styling", async () => {
    const feature = {
      ...task("Knowledge"),
      id: "feature-1",
      type: "feature",
    } as Task;
    const view = (status: "done" | "in-progress") => (
      <ReleaseFeatureGroup
        {...props}
        group={{
          feature,
          inRelease: true,
          tasks: completedWork,
          tasksElsewhere: 0,
        }}
        milestones={[{ ...milestone, status }]}
      />
    );
    const rendered = render(view("done"));
    fireEvent.click(screen.getByRole("button", { name: /^Show tasks/ }));
    expect(workLinks()).toHaveLength(2);

    rendered.rerender(view("in-progress"));
    expect(workLinks()).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^Hide tasks/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: milestone.title }),
    ).not.toHaveClass("line-through");

    rendered.rerender(view("done"));
    expect(workLinks()).toHaveLength(2);
    expect(screen.getByRole("button", { name: milestone.title })).toHaveClass(
      "line-through",
    );
    fireEvent.click(screen.getByRole("button", { name: /^Hide tasks/ }));
    await waitFor(() => expect(workLinks()).toHaveLength(0));

    rendered.rerender(view("in-progress"));
    expect(workLinks()).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Show tasks/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("starts collapsed again when navigating to another release", () => {
    const feature = {
      ...task("Knowledge"),
      id: "feature-1",
      type: "feature",
    } as Task;
    const view = (releaseId: string) => (
      <ReleaseFeatureGroup
        {...props}
        releaseId={releaseId}
        group={{
          feature,
          inRelease: true,
          tasks: completedWork.map((work) => ({ ...work, releaseId })),
          tasksElsewhere: 0,
        }}
        milestones={[milestone]}
      />
    );
    const rendered = render(view("release-1"));
    fireEvent.click(screen.getByRole("button", { name: /^Show tasks/ }));
    expect(workLinks()).toHaveLength(2);

    rendered.rerender(view("release-2"));
    expect(workLinks()).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Show tasks/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
