import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { MilestoneCandidate } from "@/fetchers/milestone/get-milestone-candidates";
import { HttpError } from "@/lib/http-error";
import { FeatureMilestones, type MilestoneFilter } from "./feature-milestones";
const mocks = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  pending: false,
  error: false,
  refetch: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
  canEdit: true,
  candidates: [] as MilestoneCandidate[],
  candidatesPending: false,
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, args?: Record<string, unknown>) =>
      args ? `${key} ${JSON.stringify(args)}` : key,
  }),
}));
vi.mock("@/hooks/queries/milestone/use-get-milestones", () => ({
  useGetMilestones: () => ({
    data: mocks.data,
    isPending: mocks.pending,
    isError: mocks.error,
    refetch: mocks.refetch,
  }),
}));
vi.mock("@/hooks/queries/milestone/use-milestone-candidates", () => ({
  useMilestoneCandidates: () => ({
    data: { projectSlug: "WEB", tasks: mocks.candidates },
    isPending: mocks.candidatesPending,
    isSuccess: !mocks.candidatesPending,
    isError: false,
  }),
}));
vi.mock("@/hooks/mutations/milestone/use-milestone-mutations", () => ({
  useMilestoneMutations: () => ({
    create: { mutateAsync: mocks.create },
    update: { mutateAsync: mocks.update },
    remove: { mutateAsync: mocks.remove },
    reorder: { mutateAsync: mocks.reorder },
  }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: () => mocks.canEdit }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
const milestone = (id: string, completed = 0, total = 0) => ({
  id,
  featureId: "f",
  title: id,
  description: null,
  startDate: null,
  endDate: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
  progress: { total, started: completed, completed },
});
beforeEach(() => {
  mocks.data = [];
  mocks.pending = false;
  mocks.error = false;
  mocks.canEdit = true;
  mocks.candidates = [];
  mocks.candidatesPending = false;
  vi.clearAllMocks();
});
afterEach(cleanup);
function view() {
  const onFilter = vi.fn();
  function FilteredMilestones() {
    const [filter, setFilter] = useState<MilestoneFilter>("all");
    return (
      <FeatureMilestones
        projectId="p"
        featureId="f"
        filter={filter}
        onFilter={(next) => {
          onFilter(next);
          setFilter(next);
        }}
      />
    );
  }
  render(<FilteredMilestones />);
  return onFilter;
}
async function selectMilestoneDay(label: string, day: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.change(await screen.findByRole("combobox", { name: label }), {
    target: { value: day },
  });
  fireEvent.click(await screen.findByRole("option"));
}
describe("Feature milestones", () => {
  it("shows empty state with no selected filter and no All tasks button", () => {
    view();
    expect(screen.getByText("tasks:milestones.empty")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "tasks:milestones.allTasks" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "tasks:milestones.none" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
  it("deselects a selected milestone to show all tasks without changing counts", () => {
    mocks.data = [milestone("Alpha", 1, 4), milestone("Empty")];
    const filter = view();
    const alpha = screen.getByRole("button", { name: /Alpha/ });
    const empty = screen.getByRole("button", { name: /Empty/ });
    expect(alpha).toHaveAttribute("aria-pressed", "false");
    expect(empty).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(alpha);
    expect(filter).toHaveBeenCalledWith({ id: "Alpha" });
    expect(alpha).toHaveAttribute("aria-pressed", "true");
    expect(empty).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("25% · 1/4")).toBeInTheDocument();
    expect(screen.getByText("0% · 0/0")).toBeInTheDocument();
    fireEvent.click(alpha);
    expect(filter).toHaveBeenLastCalledWith("all");
    expect(alpha).toHaveAttribute("aria-pressed", "false");
    expect(empty).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("25% · 1/4")).toBeInTheDocument();
    expect(screen.getByText("0% · 0/0")).toBeInTheDocument();
  });
  it("switches directly between milestones with only the selected row pressed", () => {
    mocks.data = [milestone("Alpha", 1, 4), milestone("Beta", 2, 3)];
    const filter = view();
    const alpha = screen.getByRole("button", { name: /Alpha/ });
    const beta = screen.getByRole("button", { name: /Beta/ });
    fireEvent.click(alpha);
    fireEvent.click(beta);
    expect(filter.mock.calls.map(([value]) => value)).toEqual([
      { id: "Alpha" },
      { id: "Beta" },
    ]);
    expect(alpha).toHaveAttribute("aria-pressed", "false");
    expect(beta).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("25% · 1/4")).toBeInTheDocument();
    expect(screen.getByText("67% · 2/3")).toBeInTheDocument();
  });
  it("toggles No milestone and switches between it and a milestone", () => {
    mocks.data = [milestone("Alpha", 1, 4)];
    const filter = view();
    const alpha = screen.getByRole("button", { name: /Alpha/ });
    const none = screen.getByRole("button", { name: "tasks:milestones.none" });
    fireEvent.click(alpha);
    fireEvent.click(none);
    expect(filter).toHaveBeenLastCalledWith("none");
    expect(alpha).toHaveAttribute("aria-pressed", "false");
    expect(none).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(none);
    expect(filter).toHaveBeenLastCalledWith("all");
    expect(none).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(none);
    fireEvent.click(alpha);
    expect(filter).toHaveBeenLastCalledWith({ id: "Alpha" });
    expect(alpha).toHaveAttribute("aria-pressed", "true");
    expect(none).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("25% · 1/4")).toBeInTheDocument();
  });
  it("exposes loading and retry states", () => {
    mocks.pending = true;
    const { unmount } = render(
      <FeatureMilestones
        projectId="p"
        featureId="f"
        filter="all"
        onFilter={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "tasks:milestones.loading",
    );
    unmount();
    mocks.pending = false;
    mocks.error = true;
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
  it("creates metadata through an accessible dialog", async () => {
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.add" }),
    );
    fireEvent.change(screen.getByLabelText("tasks:milestones.titleLabel"), {
      target: { value: "  Alpha  " },
    });
    expect(
      screen.queryByLabelText("tasks:milestones.description"),
    ).not.toBeInTheDocument();
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
    await selectMilestoneDay("tasks:milestones.endDate", "2026-11-01");
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.save" }),
    );
    expect(mocks.create).toHaveBeenCalledWith({
      title: "Alpha",
      startDate: null,
      endDate: "2026-11-01",
    });
  });
  it("edits visible metadata without clearing an existing hidden description", async () => {
    mocks.data = [
      {
        ...milestone("legacy"),
        description: "Keep these stored legacy notes",
        startDate: "2026-11-02",
        endDate: "2026-11-04",
      },
    ];
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.actions" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "tasks:milestones.edit" }),
    );
    expect(
      screen.queryByLabelText("tasks:milestones.description"),
    ).not.toBeInTheDocument();
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Keep these stored legacy notes"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("tasks:milestones.titleLabel"), {
      target: { value: "Renamed milestone" },
    });
    await selectMilestoneDay("tasks:milestones.endDate", "2026-11-06");
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.save" }),
    );
    expect(mocks.update).toHaveBeenCalledWith({
      id: "legacy",
      title: "Renamed milestone",
      startDate: "2026-11-02",
      endDate: "2026-11-06",
    });
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("description");
  });
  it("uses the shared date picker to reject an end before the start and save a range", async () => {
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.add" }),
    );
    fireEvent.change(screen.getByLabelText("tasks:milestones.titleLabel"), {
      target: { value: "Alpha" },
    });
    await selectMilestoneDay("tasks:milestones.startDate", "2026-11-02");
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.endDate" }),
    );
    const end = await screen.findByRole("combobox", {
      name: "tasks:milestones.endDate",
    });
    fireEvent.change(end, { target: { value: "2026-11-01" } });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(
      screen.getByText(/tasks:datePicker.beforeStart/),
    ).toBeInTheDocument();
    fireEvent.change(end, { target: { value: "2026-11-04" } });
    fireEvent.click(await screen.findByRole("option"));
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.save" }),
    );
    expect(mocks.create).toHaveBeenCalledWith({
      title: "Alpha",
      startDate: "2026-11-02",
      endDate: "2026-11-04",
    });
  });
  it("creates the milestone and links selected Tasks and Bugs in one request", async () => {
    mocks.candidates = [
      { id: "t", title: "Task A", type: "task", number: 1, milestoneId: null },
      { id: "b", title: "Bug B", type: "bug", number: 2, milestoneId: null },
      {
        id: "assigned",
        title: "Assigned",
        type: "task",
        number: 3,
        milestoneId: "old",
      },
    ];
    mocks.data = [{ ...milestone("old"), title: "Old milestone" }];
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.add" }),
    );
    fireEvent.change(screen.getByLabelText("tasks:milestones.titleLabel"), {
      target: { value: "New milestone" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /WEB-1.*Task A/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /WEB-2.*Bug B/ }));
    expect(
      screen.queryByRole("checkbox", { name: /Assigned/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.save" }),
    );
    expect(mocks.create).toHaveBeenCalledWith({
      title: "New milestone",
      startDate: null,
      endDate: null,
      taskIds: ["t", "b"],
    });
  });
  it("allows empty creation while candidates load", () => {
    mocks.candidatesPending = true;
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.add" }),
    );
    fireEvent.change(screen.getByLabelText("tasks:milestones.titleLabel"), {
      target: { value: "Empty milestone" },
    });
    expect(
      screen.getByText("tasks:milestones.loadingTasks"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "tasks:milestones.save" }),
    ).toBeEnabled();
  });
  it("keeps the creation draft open after an atomic selection conflict", async () => {
    mocks.candidates = [
      { id: "t", title: "Task A", type: "task", number: 1, milestoneId: null },
    ];
    mocks.create.mockRejectedValueOnce(
      new HttpError(409, "Selected task changed"),
    );
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.add" }),
    );
    fireEvent.change(screen.getByLabelText("tasks:milestones.titleLabel"), {
      target: { value: "Draft milestone" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Task A/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.save" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tasks:milestones.taskSelectionChanged",
    );
    expect(screen.getByLabelText("tasks:milestones.titleLabel")).toHaveValue(
      "Draft milestone",
    );
    expect(screen.getByRole("checkbox", { name: /Task A/ })).toBeChecked();
  });
  it("provides ordering and a destructive confirmation", async () => {
    mocks.data = [milestone("Alpha"), milestone("Beta")];
    view();
    fireEvent.click(
      screen.getAllByRole("button", { name: "tasks:milestones.actions" })[0],
    );
    expect(
      await screen.findByRole("menuitem", { name: "tasks:milestones.moveUp" }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(
      screen.getByRole("menuitem", { name: "tasks:milestones.moveDown" }),
    );
    expect(mocks.reorder).toHaveBeenCalledWith(["Beta", "Alpha"]);
    fireEvent.click(
      screen.getAllByRole("button", { name: "tasks:milestones.actions" })[0],
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "tasks:milestones.delete" }),
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "tasks:milestones.deleteDescription",
    );
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.delete" }),
    );
    expect(mocks.remove).toHaveBeenCalledWith("Alpha");
  });
  it("hides management for read-only users", () => {
    mocks.canEdit = false;
    mocks.data = [milestone("Alpha")];
    view();
    expect(
      screen.queryByRole("button", { name: "tasks:milestones.add" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "tasks:milestones.actions" }),
    ).not.toBeInTheDocument();
  });
});
