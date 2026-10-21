import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ComponentProps } from "react";
import type { Milestone } from "@/fetchers/milestone/milestones";
import { MilestoneRow } from "./milestone-row";

const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/store/milestone-details", () => ({
  openMilestoneDetails: mocks.open,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/i18n/domain", () => ({
  getStatusDisplayLabel: (status: string) => {
    const labels: Record<string, string> = {
      "to-do": "To Do",
      "in-progress": "In Progress",
      done: "Done",
    };
    return labels[status] ?? status;
  },
}));
vi.mock("@/lib/format", () => ({
  formatDateShort: (value: string) => value.slice(0, 10),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const milestone: Milestone = {
  id: "m",
  featureId: "f",
  title: "Launch checkout",
  description: null,
  status: "in-progress",
  columnId: null,
  priority: "urgent",
  leadId: "lead",
  releaseId: "r",
  startDate: null,
  endDate: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
  progress: { total: 4, started: 2, completed: 1 },
};

function view(overrides: Partial<ComponentProps<typeof MilestoneRow>> = {}) {
  const props = {
    milestone,
    projectId: "p",
    releaseName: "Autumn release",
    selected: false,
    canEdit: true,
    first: false,
    last: false,
    pending: false,
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    ...overrides,
  };
  render(<MilestoneRow {...props} />);
  return props;
}

describe("Milestone row", () => {
  it.each([
    [
      "to-do",
      "To Do",
      "text-muted-foreground",
      { total: 0, started: 0, completed: 0 },
    ],
    [
      "in-progress",
      "In Progress",
      "text-amber-500",
      { total: 4, started: 2, completed: 1 },
    ],
    ["done", "Done", "fill-primary", { total: 4, started: 3, completed: 3 }],
  ] as const)(
    "uses canonical %s status for the diamond independently of progress totals",
    (status, label, styling, progress) => {
      view({ milestone: { ...milestone, status, progress } });
      const select = screen.getByRole("button", { name: /Launch checkout/ });
      expect(select.querySelector("svg")).toHaveClass(styling);
      expect(select.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(within(select).getByText(label)).toHaveClass("sr-only");
      expect(select).toHaveAccessibleName(expect.stringContaining(label));
      // Priority is deliberately absent; the row's only icon is its diamond.
      expect(select.querySelectorAll("svg")).toHaveLength(1);
      if (status === "done")
        expect(within(select).getByText("75% · 3/4")).toBeInTheDocument();
    },
  );

  it("keeps long milestone and release names together with their full titles", () => {
    const title = "Checkout delivery and payment implementation "
      .repeat(4)
      .trim();
    const releaseName = "Autumn commercial release ".repeat(4).trim();
    view({ milestone: { ...milestone, title }, releaseName });
    const name = screen.getByTitle(title);
    const release = screen.getByTitle(releaseName);
    expect(name.parentElement).toBe(release.parentElement);
    expect(release).toHaveTextContent(releaseName.trim());
    expect(within(name.parentElement!).getByText("·")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("omits the release and separator when no release name is available", () => {
    view({ releaseName: undefined });
    const heading = screen.getByTitle(milestone.title).parentElement!;
    expect(heading).toHaveTextContent(milestone.title);
    expect(within(heading).queryByText("·")).not.toBeInTheDocument();
    expect(screen.queryByText("Autumn release")).not.toBeInTheDocument();
  });

  it("preserves selection, dates, progress and the details action", () => {
    const props = view({
      selected: true,
      milestone: {
        ...milestone,
        startDate: "2026-10-20",
        endDate: "2026-10-28",
      },
    });
    const select = screen.getByRole("button", { name: /Launch checkout/ });
    expect(select).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("2026-10-20 – 2026-10-28")).toBeInTheDocument();
    expect(screen.getByText("25% · 1/4")).toBeInTheDocument();
    fireEvent.click(select);
    expect(props.onSelect).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.open" }),
    );
    expect(mocks.open).toHaveBeenCalledWith("p", "m");
    expect(props.onSelect).toHaveBeenCalledOnce();
  });

  it("retains milestone edit and ordering actions", async () => {
    const props = view();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.actions" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "tasks:milestones.moveDown",
      }),
    );
    expect(props.onMove).toHaveBeenCalledWith(1);
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.actions" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "tasks:milestones.edit" }),
    );
    expect(props.onEdit).toHaveBeenCalledOnce();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("keeps read-only users able to select and open without management actions", () => {
    const props = view({ canEdit: false });
    expect(
      screen.queryByRole("button", { name: "tasks:milestones.actions" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Launch checkout/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.open" }),
    );
    expect(props.onSelect).toHaveBeenCalledOnce();
    expect(mocks.open).toHaveBeenCalledWith("p", "m");
  });
});
