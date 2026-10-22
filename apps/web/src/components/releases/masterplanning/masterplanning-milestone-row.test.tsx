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
import type { MilestoneWithFeature } from "@/fetchers/milestone/milestones";
import type { Release } from "@/types/release";
import { MasterplanningMilestoneRow } from "./masterplanning-milestone-row";

const mocks = vi.hoisted(() => ({ open: vi.fn(), draggable: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "tasks:milestones.dateRange")
        return `${options?.start} – ${options?.end}`;
      if (key === "tasks:releases.masterplanning.progress")
        return `${options?.percentage}% · ${options?.completed}/${options?.total} completed across all linked Tasks and Bugs`;
      return key;
    },
  }),
}));
vi.mock("@dnd-kit/core", () => ({
  useDraggable: (...args: unknown[]) => mocks.draggable(...args),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to: _to,
    search,
    ...props
  }: {
    children: ReactNode;
    params: { workspaceId: string; projectId: string; taskId: string };
    to?: string;
    search?: { originReleaseId?: string };
    title?: string;
    className?: string;
  }) => (
    <a
      href={`/dashboard/workspace/${params.workspaceId}/project/${params.projectId}/task/${params.taskId}${search?.originReleaseId ? `?originReleaseId=${search.originReleaseId}` : ""}`}
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/store/milestone-details", () => ({
  openMilestoneDetails: mocks.open,
}));
vi.mock("@/lib/i18n/domain", () => ({
  getStatusDisplayLabel: (status: string) =>
    (
      ({
        "to-do": "To Do",
        "in-progress": "In Progress",
        done: "Done",
      }) as Record<string, string>
    )[status] ?? status,
  getPriorityLabel: (priority: string) =>
    (
      ({ urgent: "Urgent", "no-priority": "No priority" }) as Record<
        string,
        string
      >
    )[priority] ?? priority,
}));
vi.mock("@/lib/format", () => ({
  formatDateShort: (date: string) => date.slice(0, 10),
}));

const milestone: MilestoneWithFeature = {
  id: "m",
  featureId: "feature",
  featureTitle: "Commerce",
  projectId: "p",
  title: "Checkout",
  releaseId: "r1",
  leadId: "lead",
  status: "in-progress",
  columnId: null,
  priority: "urgent",
  startDate: "2026-10-20",
  endDate: "2026-10-28",
  position: 0,
  createdAt: "",
  updatedAt: "",
  progress: { total: 4, started: 2, completed: 1 },
};
const releases = [
  { id: "r1", name: "Current" },
  { id: "r2", name: "Next" },
] as Release[];
function view(
  overrides: Partial<ComponentProps<typeof MasterplanningMilestoneRow>> = {},
) {
  const props = {
    milestone,
    workspaceId: "w",
    projectId: "p",
    leadName: "Max",
    releases,
    canMove: true,
    pending: false,
    failed: false,
    onMove: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
  const rendered = render(
    <ul>
      <MasterplanningMilestoneRow {...props} />
    </ul>,
  );
  return { ...rendered, props };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.draggable.mockReturnValue({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    setActivatorNodeRef: vi.fn(),
    isDragging: false,
  });
});
afterEach(cleanup);

describe("Masterplanning milestone row", () => {
  it("shows full planning metadata, radial progress and independent Feature/details links", () => {
    view();
    expect(screen.getByText("25% · 1/4").parentElement).toHaveAttribute(
      "aria-label",
      "25% · 1/4 completed across all linked Tasks and Bugs",
    );
    expect(screen.getByText("In Progress")).toHaveClass("sr-only");
    expect(screen.getByText("Max")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.getByTitle("2026-10-20 – 2026-10-28")).toBeInTheDocument();
    const feature = screen.getByRole("link", { name: "Commerce" });
    expect(feature).toHaveAttribute(
      "href",
      "/dashboard/workspace/w/project/p/task/feature?originReleaseId=r1",
    );
    const title = screen.getByRole("button", { name: "Checkout" });
    expect(title).toHaveAttribute("title", "Checkout");
    fireEvent.click(title);
    expect(mocks.open).toHaveBeenCalledExactlyOnceWith("p", "m");
    const diamond = screen
      .getByRole("listitem")
      .querySelector("svg.lucide-diamond");
    expect(diamond?.querySelector("clipPath path")).toHaveAttribute(
      "d",
      expect.stringContaining("A 24 24"),
    );
  });
  it("crosses out a Done milestone independently of archived work remaining in its totals", () => {
    view({
      milestone: {
        ...milestone,
        status: "done",
        progress: { total: 4, started: 3, completed: 3 },
      },
    });
    expect(screen.getByRole("button", { name: "Checkout" })).toHaveClass(
      "line-through",
    );
    expect(screen.getByText("Done")).toHaveClass("sr-only");
    expect(screen.getByText("75% · 3/4")).toBeInTheDocument();
  });
  it("shows zero progress and no date label for an empty undated milestone, with a safe missing lead name", () => {
    view({
      leadName: undefined,
      milestone: {
        ...milestone,
        leadId: null,
        startDate: null,
        endDate: null,
        progress: { total: 0, started: 0, completed: 0 },
      },
    });
    expect(screen.getByText("0% · 0/0")).toBeInTheDocument();
    expect(
      screen.getByText("tasks:popover.assignee.unassigned"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTitle("2026-10-20 – 2026-10-28"),
    ).not.toBeInTheDocument();
  });
  it("keeps read-only rows openable but removes movement controls and disables dragging", () => {
    view({ canMove: false });
    expect(mocks.draggable).toHaveBeenCalledWith({
      id: "m",
      data: { milestoneId: "m" },
      disabled: true,
    });
    expect(
      screen.queryByRole("button", {
        name: "tasks:releases.masterplanning.moveToRelease",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Checkout" }));
    expect(mocks.open).toHaveBeenCalledOnce();
  });
  it("removes retry after permission revocation and disables retry when its destination was deleted", () => {
    const { props, rerender } = view({ failed: true });
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.masterplanning.retryMove",
      }),
    ).toBeEnabled();
    rerender(
      <ul>
        <MasterplanningMilestoneRow {...props} retryDisabled />
      </ul>,
    );
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.masterplanning.retryMove",
      }),
    ).toBeDisabled();
    rerender(
      <ul>
        <MasterplanningMilestoneRow {...props} canMove={false} />
      </ul>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.masterplanning.moveError",
    );
    expect(
      screen.queryByRole("button", {
        name: "tasks:releases.masterplanning.retryMove",
      }),
    ).not.toBeInTheDocument();
    expect(props.onRetry).not.toHaveBeenCalled();
  });
  it("does not inherit stale release origin when opening an unassigned milestone's Feature", () => {
    view({ milestone: { ...milestone, releaseId: null } });
    expect(screen.getByRole("link", { name: "Commerce" })).toHaveAttribute(
      "href",
      "/dashboard/workspace/w/project/p/task/feature",
    );
  });
  it("offers keyboard-accessible release and No release choices without offering a same-release write", async () => {
    const { props } = view();
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:releases.masterplanning.moveToRelease",
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Current" }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Next" }));
    expect(props.onMove).toHaveBeenCalledExactlyOnceWith("r2");
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:releases.masterplanning.moveToRelease",
      }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "tasks:releases.none" }),
    );
    expect(props.onMove).toHaveBeenLastCalledWith(null);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("disables movement and retries during saving while retaining failure feedback", () => {
    const { props, rerender } = view({ pending: true, failed: true });
    expect(screen.getByRole("listitem")).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.masterplanning.moveToRelease",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.masterplanning.retryMove",
      }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.masterplanning.moveError",
    );
    expect(mocks.draggable).toHaveBeenLastCalledWith({
      id: "m",
      data: { milestoneId: "m" },
      disabled: true,
    });
    rerender(
      <ul>
        <MasterplanningMilestoneRow {...props} pending={false} />
      </ul>,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:releases.masterplanning.retryMove",
      }),
    );
    expect(props.onRetry).toHaveBeenCalledOnce();
  });
  it("preserves full hover names and separate drag activation for long titles", () => {
    const title = "Checkout payment integration ".repeat(10).trim();
    const featureTitle = "Commerce and storefront ".repeat(10).trim();
    const activation = vi.fn();
    mocks.draggable.mockReturnValue({
      attributes: {},
      listeners: { onPointerDown: activation },
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      isDragging: false,
    });
    view({ milestone: { ...milestone, title, featureTitle } });
    expect(screen.getByTitle(title)).toHaveClass("truncate");
    expect(screen.getByTitle(featureTitle)).toHaveClass("truncate");
    fireEvent.pointerDown(screen.getByRole("button", { name: title }));
    expect(activation).not.toHaveBeenCalled();
    const handle = screen
      .getByRole("listitem")
      .querySelector('button[aria-hidden="true"]');
    expect(handle).toHaveAttribute("tabindex", "-1");
    fireEvent.pointerDown(handle!);
    expect(activation).toHaveBeenCalledOnce();
  });
});
