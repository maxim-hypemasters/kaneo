import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { Milestone } from "@/fetchers/milestone/milestones";
import { HttpError } from "@/lib/http-error";
import { MilestoneDialog } from "./milestone-dialog";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  pending: false,
  canCreate: true,
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("@/lib/i18n/domain", () => ({
  getStatusDisplayLabel: (status: string) => status,
  getPriorityLabel: (priority: string) => priority,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, args?: Record<string, unknown>) =>
      args?.index ? `${key} ${args.index}` : key,
  }),
}));
vi.mock("@/hooks/mutations/milestone/use-milestone-mutations", () => ({
  useMilestoneMutations: () => ({
    create: { mutateAsync: mocks.create, isPending: mocks.pending },
    update: { mutateAsync: mocks.update, isPending: false },
  }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: () => mocks.canCreate,
    canUpdateTasks: () => true,
    canAssignTasks: () => true,
  }),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "w" } }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => ({
    data: [
      { id: "r1", name: "Release one" },
      { id: "r2", name: "Release two" },
    ],
  }),
}));
vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/milestone/use-milestone-candidates", () => ({
  useMilestoneCandidates: () => ({
    data: {
      projectSlug: "WEB",
      tasks: [
        {
          id: "existing",
          title: "Existing work",
          type: "bug",
          number: 7,
          milestoneId: null,
        },
      ],
    },
    isPending: false,
    isError: false,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending = false;
  mocks.canCreate = true;
  mocks.create.mockResolvedValue({});
  mocks.update.mockResolvedValue({});
});
afterEach(cleanup);

function enterTitle() {
  fireEvent.change(
    screen.getByRole("textbox", { name: "tasks:milestones.titleLabel" }),
    { target: { value: "  Milestone  " } },
  );
}
async function addDraft(type: "task" | "bug", title: string) {
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:createMenu.label" }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", {
      name:
        type === "task"
          ? "tasks:createMenu.newTask"
          : "tasks:createMenu.newBug",
    }),
  );
  const rows = screen.getAllByRole("textbox", {
    name: /tasks:milestones.newTaskTitle/,
  });
  fireEvent.change(rows.at(-1)!, { target: { value: title } });
}
function submit() {
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:milestones.save" }),
  );
}
function linkExisting() {
  fireEvent.click(screen.getByRole("checkbox", { name: /Existing work/ }));
}

describe("Milestone creation", () => {
  it("combines selected work and trimmed Task/Bug drafts in one save", async () => {
    const onClose = vi.fn();
    render(
      <MilestoneDialog
        projectId="p"
        featureId="f"
        initialReleaseId="r1"
        onClose={onClose}
      />,
    );
    for (const name of [
      "tasks:status.label",
      "tasks:milestones.startDate",
      "tasks:milestones.endDate",
    ]) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
    enterTitle();
    linkExisting();
    await addDraft("task", "  First draft  ");
    await addDraft("bug", " Fix the defect ");
    expect(mocks.create).not.toHaveBeenCalled();
    submit();
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
        title: "Milestone",
        leadId: null,
        priority: "no-priority",
        releaseId: "r1",
        taskIds: ["existing"],
        newTasks: [
          { title: "First draft", type: "task" },
          { title: "Fix the defect", type: "bug" },
        ],
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("rejects blank draft titles and supports type changes and removal before saving", async () => {
    render(<MilestoneDialog projectId="p" featureId="f" onClose={vi.fn()} />);
    enterTitle();
    await addDraft("task", "  ");
    expect(
      screen.getByRole("button", { name: "tasks:milestones.save" }),
    ).toBeDisabled();
    expect(
      screen.getByText("tasks:milestones.newTaskTitleRequired"),
    ).toBeInTheDocument();
    const input = screen.getByRole("textbox", {
      name: "tasks:milestones.newTaskTitle 1",
    });
    expect(input).not.toHaveAttribute("maxlength");
    fireEvent.submit(input.closest("form")!);
    expect(mocks.create).not.toHaveBeenCalled();
    const longTitle = "Changed type ".repeat(30).trim();
    fireEvent.change(input, { target: { value: longTitle } });
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.newTaskType 1" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitemradio", {
        name: "tasks:features.typeBug",
      }),
    );
    await addDraft("task", "Remove me");
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.removeNewTask 2" }),
    );
    submit();
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          newTasks: [{ title: longTitle, type: "bug" }],
        }),
      ),
    );
  });

  it("keeps selections, drafts, and planning after validation failure and allows retry", async () => {
    mocks.create.mockRejectedValueOnce(
      new HttpError(400, "Required field Customer has no default"),
    );
    const onClose = vi.fn();
    render(
      <MilestoneDialog
        projectId="p"
        featureId="f"
        initialReleaseId="r1"
        onClose={onClose}
      />,
    );
    enterTitle();
    linkExisting();
    await addDraft("bug", "Keep this draft");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Required field Customer has no default",
    );
    expect(
      screen.getByRole("checkbox", { name: /Existing work/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "tasks:milestones.newTaskTitle 1" }),
    ).toHaveValue("Keep this draft");
    expect(
      screen.getByRole("button", { name: "tasks:releases.property" }),
    ).toHaveTextContent("Release one");
    expect(onClose).not.toHaveBeenCalled();
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });

  it("cancels without writing a milestone or any draft work", async () => {
    const onClose = vi.fn();
    render(<MilestoneDialog projectId="p" featureId="f" onClose={onClose} />);
    enterTitle();
    linkExisting();
    await addDraft("task", "Unsaved work");
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("permits metadata and existing-work linking without task-create permission", async () => {
    mocks.canCreate = false;
    render(<MilestoneDialog projectId="p" featureId="f" onClose={vi.fn()} />);
    expect(
      screen.queryByText("tasks:milestones.newTasks"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "tasks:createMenu.label" }),
    ).not.toBeInTheDocument();
    enterTitle();
    linkExisting();
    submit();
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ taskIds: ["existing"] }),
      ),
    );
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("newTasks");
  });

  it("snapshots release context and respects an explicit No release override", async () => {
    const props = { projectId: "p", featureId: "f", onClose: vi.fn() };
    const { rerender } = render(
      <MilestoneDialog {...props} initialReleaseId="r1" />,
    );
    rerender(<MilestoneDialog {...props} initialReleaseId="r2" />);
    expect(
      screen.getByRole("button", { name: "tasks:releases.property" }),
    ).toHaveTextContent("Release one");
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.property" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "tasks:releases.none" }),
    );
    rerender(<MilestoneDialog {...props} initialReleaseId="r1" />);
    enterTitle();
    submit();
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ releaseId: null }),
      ),
    );
  });

  it("disables editing and every closing route while saving", async () => {
    const onClose = vi.fn();
    const props = { projectId: "p", featureId: "f", onClose };
    const { rerender } = render(<MilestoneDialog {...props} />);
    enterTitle();
    await addDraft("task", "Pending work");
    mocks.pending = true;
    rerender(<MilestoneDialog {...props} />);
    expect(
      screen.queryByRole("button", { name: "common:actions.close" }),
    ).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button"))
      expect(button).toBeDisabled();
    for (const input of screen.getAllByRole("textbox"))
      expect(input).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /Existing work/ }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps editing status/dates read-only and never inherits origin release", async () => {
    const milestone = {
      id: "m",
      featureId: "f",
      title: "Existing milestone",
      leadId: null,
      priority: "no-priority",
      releaseId: null,
      status: "in-progress",
      columnId: null,
      startDate: "2026-10-20",
      endDate: "2026-10-22",
      position: 0,
      createdAt: "",
      updatedAt: "",
      progress: { total: 1, started: 1, completed: 0 },
    } satisfies Milestone;
    render(
      <MilestoneDialog
        projectId="p"
        featureId="f"
        milestone={milestone}
        initialReleaseId="r1"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("tasks:status.label")).toHaveTextContent(
      "in-progress",
    );
    expect(
      screen.getByLabelText("tasks:milestones.startDate"),
    ).toHaveTextContent("Oct 20, 2026");
    expect(screen.getByLabelText("tasks:milestones.endDate")).toHaveTextContent(
      "Oct 22, 2026",
    );
    expect(
      screen.queryByText("tasks:milestones.newTasks"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("tasks:milestones.linkTasks"),
    ).not.toBeInTheDocument();
    submit();
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        id: "m",
        title: "Existing milestone",
        leadId: null,
        priority: "no-priority",
        releaseId: null,
      }),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
