import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { Release } from "@/types/release";
import type {
  ReleasePlan,
  ReleasePlanChanges,
  ReleasePlanPreview,
} from "@/types/release-plan";
import { ReleasePlanDialog } from "./release-plan-dialog";

const m = vi.hoisted(() => ({
  calculate: {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null as Error | null,
  },
  apply: {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null as Error | null,
  },
  query: {
    data: undefined as ReleasePlan | undefined,
    isPending: false,
    isError: false,
    error: null as Error | null,
    isFetching: false,
    refetch: vi.fn(),
  },
  preview: null as ReleasePlanPreview | null,
  tasks: [] as ReleasePlanPreview["tasks"],
  get remainingTasks() {
    return this.tasks.filter(
      (task) =>
        !this.changes.moves?.some((move) => move.taskId === task.taskId),
    );
  },
  get resolutionTasks() {
    return this.tasks;
  },
  changes: {} as ReleasePlanChanges,
  hasChanges: false,
  updateChanges: vi.fn(),
  discardChanges: vi.fn(),
  stale: false,
  applied: false,
  inputSaving: false,
  setInputSaving: vi.fn(),
  inputsSaved: vi.fn(),
  reset: vi.fn(),
  cancelCalculation: vi.fn(),
}));
vi.mock("./use-release-plan", () => ({ useReleasePlan: () => m }));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => ({
    data: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("./resolution/release-plan-resolution", () => ({
  ReleasePlanResolution: () => <div>Deadline resolution controls</div>,
}));
vi.mock("./release-plan-task-inputs", () => ({
  ReleasePlanTaskInputs: ({
    task: currentTask,
    disabled,
    onSavingChange,
    onSaved,
  }: {
    task: ReleasePlanPreview["tasks"][number];
    disabled: boolean;
    onSavingChange: (saving: boolean) => void;
    onSaved: (patch: { estimateSeconds: number }) => void;
  }) => (
    <div>
      <span>
        {currentTask.currentAssigneeName ?? "Unassigned"} ·{" "}
        {currentTask.estimateSeconds ?? "No estimate"} · {currentTask.priority}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSavingChange(true)}
      >
        Edit assignee
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSaved({ estimateSeconds: 14400 })}
      >
        Save estimate
      </button>
    </div>
  ),
}));
vi.mock("./preview/release-plan-timeline", () => ({
  ReleasePlanTimeline: ({ preview }: { preview: ReleasePlanPreview }) => (
    <div role="region" aria-label="timeline">
      {preview.revision}
    </div>
  ),
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const release: Release = {
  id: "release",
  projectId: "project",
  name: "0.70",
  startDate: "2026-10-19",
  codeFreezeDate: "2026-10-25",
  submissionDate: "2026-10-27",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  description: null,
  progress: {
    tasks: { total: 1, completed: 0 },
    features: { total: 0, completed: 0 },
    milestones: { total: 0, completed: 0 },
    unfinished: 1,
  },
};
const props = { projectId: "project", workspaceId: "workspace", release };
const task: ReleasePlanPreview["tasks"][number] = {
  taskId: "bug",
  title: "Fix deployment",
  number: 2,
  identifier: "EPD-2",
  type: "bug",
  assigneeId: "user",
  assigneeName: "Max",
  currentAssigneeId: "user",
  currentAssigneeName: "Max",
  estimateSeconds: 14400,
  priority: "no-priority",
  completed: false,
  currentStart: null,
  currentEnd: null,
  start: "2026-10-26T08:00:00Z",
  end: "2026-10-26T12:00:00Z",
  segments: [{ start: "2026-10-26T08:00:00Z", end: "2026-10-26T12:00:00Z" }],
  reason: null,
  changed: true,
};
const preview = (): ReleasePlanPreview => ({
  asOf: "2026-10-25T12:00:00Z",
  expiresAt: "2099-10-25T12:15:00Z",
  planFrom: "2026-10-26T08:00:00Z",
  revision: "reviewed",
  inputRevision: "input",
  generation: 1,
  timeZone: "Europe/Belgrade",
  releaseDates: {
    startDate: release.startDate,
    codeFreezeDate: release.codeFreezeDate,
    submissionDate: release.submissionDate,
  },
  scheduledCount: 1,
  unscheduledCount: 0,
  changedCount: 1,
  diagnostics: [],
  warnings: [],
  dependencies: [],
  tasks: [task],
});
function openEditor() {
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:releases.planning.action" }),
  );
  return screen.getByRole("dialog", { name: "tasks:releases.planning.title" });
}
function openPreview() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "tasks:releases.planning.preview",
    }),
  );
  return screen.getByRole("dialog", {
    name: "tasks:releases.planning.previewTitle",
  });
}
function openDirectPreview() {
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:releases.planning.action" }),
  );
  return screen.getByRole("dialog", {
    name: "tasks:releases.planning.previewTitle",
  });
}
function closeButton(dialog: HTMLElement) {
  return within(dialog).getByRole("button", {
    name: /^(Close|common:actions.close)$/,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.calculate.isPending = false;
  m.calculate.error = null;
  m.apply.isPending = false;
  m.apply.error = null;
  m.query.data = {
    releaseId: "release",
    revision: "input",
    inputRevision: "input",
    generation: 1,
    appliedAt: null,
    planned: false,
    outdated: false,
    timeZone: "UTC",
    tasks: [task],
  };
  m.query.isPending = false;
  m.query.isFetching = false;
  m.query.isError = false;
  m.query.error = null;
  m.tasks = [task];
  m.preview = null;
  m.stale = false;
  m.applied = false;
  m.inputSaving = false;
  m.changes = {};
  m.hasChanges = false;
  m.calculate.mutate.mockImplementation(() => {
    m.preview = preview();
  });
  m.cancelCalculation.mockImplementation(() => {
    m.calculate.isPending = false;
  });
});
afterEach(cleanup);

describe("release planning entry and preview", () => {
  it("opens an input-only editor with a single Preview footer and no automatic calculation", () => {
    m.tasks = [{ ...task, estimateSeconds: null }];
    render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    expect(m.calculate.mutate).not.toHaveBeenCalled();
    expect(within(editor).getByText("Fix deployment")).toBeVisible();
    expect(within(editor).getByText("EPD-2")).toBeVisible();
    expect(
      within(editor).getByRole("heading", {
        name: "tasks:releases.planning.editorItems",
        level: 3,
      }),
    ).toBeVisible();
    expect(
      within(editor).queryByText("tasks:releases.planning.editorHelp"),
    ).not.toBeInTheDocument();
    expect(
      within(editor).getByText("tasks:releases.planning.description"),
    ).toHaveClass("sr-only");
    for (const key of ["inputsRequired", "inputsReady"])
      expect(
        within(editor).queryByText(`tasks:releases.planning.${key}`),
      ).not.toBeInTheDocument();
    expect(
      within(editor).getByRole("button", {
        name: "tasks:releases.planning.preview",
      }),
    ).toBeDisabled();
    for (const name of [
      "common:actions.cancel",
      "tasks:scheduling.apply",
      "tasks:scheduling.recalculate",
    ])
      expect(
        within(editor).queryByRole("button", { name }),
      ).not.toBeInTheDocument();
    expect(
      within(editor).queryByText("tasks:releases.planning.changed"),
    ).not.toBeInTheDocument();
    expect(
      within(editor).queryByText("tasks:releases.planning.notScheduled"),
    ).not.toBeInTheDocument();
    expect(
      within(editor).queryByRole("region", { name: "timeline" }),
    ).not.toBeInTheDocument();
  });
  it("opens the timeline directly when all inputs are ready and only applies there", () => {
    render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    expect(m.calculate.mutate).toHaveBeenCalledOnce();
    expect(
      within(dialog).getByRole("region", { name: "timeline" }),
    ).toHaveTextContent("reviewed");
    expect(
      within(dialog).getByText("tasks:releases.planning.previewDescription"),
    ).toHaveClass("sr-only");
    for (const key of [
      "tasks:scheduling.previewSummary",
      "tasks:releases.planning.workingHours",
      "tasks:releases.planning.startBoundary",
    ])
      expect(within(dialog).queryByText(key)).not.toBeInTheDocument();
    expect(m.apply.mutate).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "tasks:scheduling.apply" }),
    );
    expect(m.apply.mutate).toHaveBeenCalledOnce();
  });
  it("returns to the editor, retains input edits, and restores focus when the preview closes", async () => {
    m.tasks = [{ ...task, estimateSeconds: null }];
    const view = render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save estimate" }),
    );
    expect(m.inputsSaved).toHaveBeenCalledWith("bug", {
      estimateSeconds: 14400,
    });
    m.tasks = [task];
    view.rerender(<ReleasePlanDialog {...props} />);
    const dialog = openPreview();
    fireEvent.click(closeButton(dialog));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "tasks:releases.planning.previewTitle",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("dialog", { name: "tasks:releases.planning.title" }),
    ).toBeVisible();
    expect(
      screen.getByRole("dialog", { name: "tasks:releases.planning.title" }),
    ).toHaveTextContent("Fix deployment");
    expect(m.cancelCalculation).toHaveBeenCalledOnce();
    expect(m.reset).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "tasks:releases.planning.preview",
        }),
      ).toHaveFocus(),
    );
    expect(m.apply.mutate).not.toHaveBeenCalled();
  });
  it("allows closing a loading preview and prevents repeat calculations", async () => {
    m.calculate.mutate.mockImplementation(() => {
      m.calculate.isPending = true;
    });
    render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    expect(
      within(dialog).getByText("tasks:scheduling.calculating"),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "tasks:scheduling.apply" }),
    ).toBeDisabled();
    fireEvent.click(closeButton(dialog));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "tasks:releases.planning.previewTitle",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(m.cancelCalculation).toHaveBeenCalledOnce();
    expect(m.reset).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("dialog", { name: "tasks:releases.planning.title" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "tasks:releases.planning.action" }),
    ).toBeEnabled();
  });
  it("keeps a stale or failed chart visible and offers Refresh preview", () => {
    const view = render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    m.stale = true;
    m.apply.error = new Error("Planning inputs changed");
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      within(dialog).getByRole("region", { name: "timeline" }),
    ).toBeVisible();
    expect(within(dialog).getByText("Planning inputs changed")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "tasks:scheduling.apply" }),
    ).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "tasks:releases.planning.refreshPreview",
      }),
    );
    expect(m.calculate.mutate).toHaveBeenCalledTimes(2);
  });
  it("preserves the proposal after calculation failure and supports retry", () => {
    const view = render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    m.calculate.error = new Error("Could not calculate");
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      within(dialog).getByRole("region", { name: "timeline" }),
    ).toHaveTextContent("reviewed");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "tasks:releases.planning.refreshPreview",
      }),
    );
    expect(m.calculate.mutate).toHaveBeenCalledTimes(2);
  });
  it("disables inputs, Preview, and editor dismissal while a property is saving", () => {
    m.tasks = [{ ...task, estimateSeconds: null }];
    const view = render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    fireEvent.click(
      within(editor).getByRole("button", { name: "Edit assignee" }),
    );
    expect(m.setInputSaving).toHaveBeenCalledWith("bug", true);
    m.inputSaving = true;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      within(editor).getByRole("button", {
        name: "tasks:releases.planning.preview",
      }),
    ).toBeDisabled();
    expect(
      within(editor).getByRole("button", { name: "Edit assignee" }),
    ).toBeDisabled();
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(editor).toBeInTheDocument();
    expect(m.reset).not.toHaveBeenCalled();
  });
  it("blocks preview dismissal and duplicate Apply while publishing", () => {
    const view = render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    m.apply.isPending = true;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      within(dialog).getByRole("button", { name: "tasks:scheduling.apply" }),
    ).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog).toBeInTheDocument();
    expect(m.cancelCalculation).not.toHaveBeenCalled();
  });
  it("keeps the applied chart visible with a disabled Applied button", () => {
    const view = render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    m.applied = true;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      within(dialog).getByRole("region", { name: "timeline" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", {
        name: "tasks:releases.planning.appliedButton",
      }),
    ).toBeDisabled();
    expect(
      within(dialog).queryByRole("button", { name: "tasks:scheduling.apply" }),
    ).not.toBeInTheDocument();
  });
  it("keeps closing available after permission loss while disabling publication", async () => {
    const view = render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    view.rerender(<ReleasePlanDialog {...props} canPlan={false} />);
    expect(
      within(dialog).getByRole("button", { name: "tasks:scheduling.apply" }),
    ).toBeDisabled();
    fireEvent.click(closeButton(dialog));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "tasks:releases.planning.previewTitle",
        }),
      ).not.toBeInTheDocument(),
    );
  });
  it("does not offer planning without permission", () => {
    render(<ReleasePlanDialog {...props} canPlan={false} />);
    expect(
      screen.queryByRole("button", { name: "tasks:releases.planning.action" }),
    ).not.toBeInTheDocument();
  });

  it("shows only missing assignees or estimates, using current inputs rather than proposed assignments", () => {
    m.tasks = [
      task,
      {
        ...task,
        taskId: "unassigned",
        title: "Assign this task",
        currentAssigneeId: null,
      },
      {
        ...task,
        taskId: "unestimated",
        title: "Estimate this bug",
        estimateSeconds: null,
      },
      {
        ...task,
        taskId: "both",
        title: "Both inputs missing",
        currentAssigneeId: null,
        estimateSeconds: null,
      },
      { ...task, taskId: "zero", title: "Zero estimate", estimateSeconds: 0 },
      {
        ...task,
        taskId: "proposed-only",
        title: "Current inputs ready",
        assigneeId: null,
      },
    ];
    render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    const items = within(editor).getByRole("list", {
      name: "tasks:releases.planning.editorItems",
    });
    expect(within(items).getAllByRole("listitem")).toHaveLength(4);
    for (const title of [
      "Assign this task",
      "Estimate this bug",
      "Both inputs missing",
      "Zero estimate",
    ])
      expect(within(items).getByText(title)).toBeVisible();
    expect(
      within(editor).queryByText("Fix deployment"),
    ).not.toBeInTheDocument();
    expect(
      within(editor).queryByText("Current inputs ready"),
    ).not.toBeInTheDocument();
    const button = within(editor).getByRole("button", {
      name: "tasks:releases.planning.preview",
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(m.calculate.mutate).not.toHaveBeenCalled();
  });

  it("does not require priority and uses current inputs for direct preview", () => {
    m.tasks = [{ ...task, assigneeId: null }];
    render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    expect(m.calculate.mutate).toHaveBeenCalledOnce();
    expect(
      within(dialog).getByRole("region", { name: "timeline" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: "tasks:releases.planning.title" }),
    ).not.toBeInTheDocument();
  });

  it("waits for fresh metadata instead of using cached readiness", () => {
    m.query.isFetching = true;
    const view = render(<ReleasePlanDialog {...props} />);
    openEditor();
    expect(m.calculate.mutate).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", {
        name: "tasks:releases.planning.previewTitle",
      }),
    ).not.toBeInTheDocument();
    m.tasks = [{ ...task, estimateSeconds: null }];
    m.query.isFetching = false;
    view.rerender(<ReleasePlanDialog {...props} />);
    const editor = screen.getByRole("dialog", {
      name: "tasks:releases.planning.title",
    });
    expect(within(editor).getByText("Fix deployment")).toBeVisible();
    expect(m.calculate.mutate).not.toHaveBeenCalled();
  });

  it("enters preview after initial metadata resolves and does not recalculate on refresh", () => {
    m.query.data = undefined;
    m.query.isPending = true;
    m.query.isFetching = true;
    const view = render(<ReleasePlanDialog {...props} />);
    openEditor();
    expect(m.calculate.mutate).not.toHaveBeenCalled();
    m.query.data = {
      releaseId: "release",
      revision: "input",
      inputRevision: "input",
      generation: 1,
      appliedAt: null,
      planned: false,
      outdated: false,
      timeZone: "UTC",
      tasks: [task],
    };
    m.query.isPending = false;
    m.query.isFetching = false;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      screen.getByRole("dialog", {
        name: "tasks:releases.planning.previewTitle",
      }),
    ).toBeVisible();
    expect(m.calculate.mutate).toHaveBeenCalledOnce();
    m.query.isFetching = true;
    view.rerender(<ReleasePlanDialog {...props} />);
    m.query.isFetching = false;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(m.calculate.mutate).toHaveBeenCalledOnce();
  });

  it("keeps retry available after metadata failure then enters preview when retry succeeds", () => {
    m.query.data = undefined;
    m.query.isError = true;
    m.query.error = new Error("Could not load work");
    const view = render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    fireEvent.click(
      within(editor).getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(m.query.refetch).toHaveBeenCalledOnce();
    expect(m.calculate.mutate).not.toHaveBeenCalled();
    m.query.data = {
      releaseId: "release",
      revision: "input",
      inputRevision: "input",
      generation: 1,
      appliedAt: null,
      planned: false,
      outdated: false,
      timeZone: "UTC",
      tasks: [task],
    };
    m.query.isError = false;
    m.query.error = null;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      screen.getByRole("dialog", {
        name: "tasks:releases.planning.previewTitle",
      }),
    ).toBeVisible();
    expect(m.calculate.mutate).toHaveBeenCalledOnce();
  });

  it("recalculates on reopening and restores the release action focus after direct close", async () => {
    render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    fireEvent.click(closeButton(dialog));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "tasks:releases.planning.previewTitle",
        }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "tasks:releases.planning.action" }),
      ).toHaveFocus(),
    );
    expect(m.reset).toHaveBeenCalledOnce();
    openDirectPreview();
    expect(m.calculate.mutate).toHaveBeenCalledTimes(2);
  });

  it("does not reopen a dismissed direct preview when a late calculation result arrives", async () => {
    m.calculate.mutate.mockImplementation(() => {
      m.calculate.isPending = true;
    });
    const view = render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    fireEvent.click(closeButton(dialog));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "tasks:releases.planning.previewTitle",
        }),
      ).not.toBeInTheDocument(),
    );
    m.preview = preview();
    m.calculate.isPending = false;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      screen.queryByRole("dialog", {
        name: "tasks:releases.planning.previewTitle",
      }),
    ).not.toBeInTheDocument();
    expect(m.cancelCalculation).toHaveBeenCalledOnce();
    expect(m.calculate.mutate).toHaveBeenCalledOnce();
  });

  it("keeps unresolved work visible and Preview blocked until saved inputs change", () => {
    m.tasks = [{ ...task, estimateSeconds: null }];
    render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    fireEvent.click(
      within(editor).getByRole("button", { name: "Edit assignee" }),
    );
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save estimate" }),
    );
    expect(m.inputsSaved).toHaveBeenCalledWith("bug", {
      estimateSeconds: 14400,
    });
    expect(within(editor).getByText("Fix deployment")).toBeVisible();
    expect(
      within(editor).getByRole("button", {
        name: "tasks:releases.planning.preview",
      }),
    ).toBeDisabled();
    expect(m.calculate.mutate).not.toHaveBeenCalled();
  });

  it("keeps corrected rows but waits for saving and metadata refresh before enabling Preview", () => {
    m.tasks = [{ ...task, estimateSeconds: null }];
    const view = render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    m.tasks = [task];
    m.inputSaving = true;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(within(editor).getByText("Fix deployment")).toBeVisible();
    expect(within(editor).getByText("Max · 14400 · no-priority")).toBeVisible();
    expect(
      within(editor).getByRole("button", {
        name: "tasks:releases.planning.preview",
      }),
    ).toBeDisabled();
    m.inputSaving = false;
    m.query.isFetching = true;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      within(editor).getByRole("button", {
        name: "tasks:releases.planning.preview",
      }),
    ).toBeDisabled();
    m.query.isFetching = false;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      within(editor).getByRole("button", {
        name: "tasks:releases.planning.preview",
      }),
    ).toBeEnabled();
    expect(m.calculate.mutate).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", {
        name: "tasks:releases.planning.previewTitle",
      }),
    ).not.toBeInTheDocument();
    m.tasks = [{ ...task, currentAssigneeId: null }];
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(within(editor).getByText("Fix deployment")).toBeVisible();
    expect(
      within(editor).getByRole("button", {
        name: "tasks:releases.planning.preview",
      }),
    ).toBeDisabled();
  });

  it("retains the reviewed chart but blocks Refresh preview when an input becomes missing", () => {
    const view = render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    m.tasks = [{ ...task, estimateSeconds: null }];
    m.stale = true;
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      within(dialog).getByRole("region", { name: "timeline" }),
    ).toBeVisible();
    expect(
      within(dialog).getByText("tasks:releases.planning.inputsRequired"),
    ).toBeVisible();
    const refresh = within(dialog).getByRole("button", {
      name: "tasks:releases.planning.refreshPreview",
    });
    expect(refresh).toBeDisabled();
    fireEvent.click(refresh);
    expect(m.calculate.mutate).toHaveBeenCalledOnce();
    expect(
      within(dialog).getByRole("button", { name: "tasks:scheduling.apply" }),
    ).toBeDisabled();
  });

  it("retains every issue row encountered during the session and renders its latest metadata", () => {
    const second = {
      ...task,
      taskId: "second",
      identifier: "EPD-3",
      title: "Review rollout",
    };
    m.tasks = [{ ...task, estimateSeconds: null }, second];
    const view = render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    expect(within(editor).getByText("Fix deployment")).toBeVisible();
    expect(
      within(editor).queryByText("Review rollout"),
    ).not.toBeInTheDocument();

    m.tasks = [task, { ...second, currentAssigneeId: null }];
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(within(editor).getByText("Fix deployment")).toBeVisible();
    expect(within(editor).getByText("Review rollout")).toBeVisible();
    expect(
      within(editor).getByRole("button", {
        name: "tasks:releases.planning.preview",
      }),
    ).toBeDisabled();

    m.tasks = [
      {
        ...task,
        title: "Fix deployment safely",
        estimateSeconds: 28800,
        currentAssigneeName: "Client dev",
        priority: "high",
      },
      second,
    ];
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(within(editor).getByText("Fix deployment safely")).toBeVisible();
    expect(within(editor).getByText("Review rollout")).toBeVisible();
    expect(within(editor).getByText("Client dev · 28800 · high")).toBeVisible();
    expect(
      within(editor).queryByText("Fix deployment"),
    ).not.toBeInTheDocument();
    expect(
      within(editor).getByRole("button", {
        name: "tasks:releases.planning.preview",
      }),
    ).toBeEnabled();
    expect(
      within(editor).queryByText("tasks:releases.planning.inputsReady"),
    ).not.toBeInTheDocument();
    expect(m.calculate.mutate).not.toHaveBeenCalled();
  });

  it("removes deleted work instead of keeping a stale retained row", () => {
    m.tasks = [{ ...task, estimateSeconds: null }];
    const view = render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    expect(within(editor).getByText("Fix deployment")).toBeVisible();
    m.tasks = [];
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(
      within(editor).queryByText("Fix deployment"),
    ).not.toBeInTheDocument();
    expect(
      within(editor).queryByRole("list", {
        name: "tasks:releases.planning.editorItems",
      }),
    ).not.toBeInTheDocument();
  });

  it("forgets corrected rows when closing and reopening the input editor", async () => {
    m.tasks = [{ ...task, estimateSeconds: null }];
    const view = render(<ReleasePlanDialog {...props} />);
    const editor = openEditor();
    m.tasks = [task];
    view.rerender(<ReleasePlanDialog {...props} />);
    expect(within(editor).getByText("Fix deployment")).toBeVisible();
    fireEvent.click(closeButton(editor));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "tasks:releases.planning.title",
        }),
      ).not.toBeInTheDocument(),
    );

    m.tasks = [
      task,
      {
        ...task,
        taskId: "new-issue",
        identifier: "EPD-3",
        title: "Assign rollout",
        currentAssigneeId: null,
      },
    ];
    view.rerender(<ReleasePlanDialog {...props} />);
    const reopened = openEditor();
    expect(within(reopened).getByText("Assign rollout")).toBeVisible();
    expect(
      within(reopened).queryByText("Fix deployment"),
    ).not.toBeInTheDocument();
  });

  it.each(["project", "release"] as const)(
    "scopes retained editor rows to the current %s",
    (context) => {
      m.tasks = [{ ...task, estimateSeconds: null }];
      const view = render(<ReleasePlanDialog {...props} />);
      const editor = openEditor();
      m.tasks = [task];
      view.rerender(<ReleasePlanDialog {...props} />);
      expect(within(editor).getByText("Fix deployment")).toBeVisible();
      m.tasks = [
        task,
        {
          ...task,
          taskId: "new-context",
          identifier: "NEW-1",
          title: "New context issue",
          estimateSeconds: null,
        },
      ];
      view.rerender(
        <ReleasePlanDialog
          {...props}
          projectId={context === "project" ? "other-project" : "project"}
          release={
            context === "release"
              ? { ...release, id: "other-release" }
              : release
          }
        />,
      );
      expect(within(editor).getByText("New context issue")).toBeVisible();
      expect(
        within(editor).queryByText("Fix deployment"),
      ).not.toBeInTheDocument();
    },
  );

  it("opens an empty proposal directly without allowing publication", () => {
    m.tasks = [];
    m.calculate.mutate.mockImplementation(() => {
      m.preview = {
        ...preview(),
        tasks: [],
        scheduledCount: 0,
        changedCount: 0,
      };
    });
    render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    expect(m.calculate.mutate).toHaveBeenCalledOnce();
    expect(
      within(dialog).getByRole("button", { name: "tasks:scheduling.apply" }),
    ).toBeDisabled();
  });

  it.each(["loading", "error"] as const)(
    "does not offer Preview or show readiness while metadata is %s",
    (state) => {
      m.tasks = [];
      m.query.data = undefined;
      m.query.isPending = state === "loading";
      m.query.isError = state === "error";
      m.query.error =
        state === "error" ? new Error("Could not load work") : null;
      render(<ReleasePlanDialog {...props} />);
      const editor = openEditor();
      expect(
        within(editor).queryByRole("button", {
          name: "tasks:releases.planning.preview",
        }),
      ).not.toBeInTheDocument();
      expect(
        within(editor).queryByText("tasks:releases.planning.inputsReady"),
      ).not.toBeInTheDocument();
    },
  );

  it("blocks Apply for unfinished work finishing after code freeze", () => {
    m.calculate.mutate.mockImplementation(() => {
      m.preview = {
        ...preview(),
        warnings: [{ taskId: task.taskId, reason: "after_code_freeze" }],
      };
    });
    render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    expect(
      within(dialog).getByText(
        "tasks:releases.planning.resolution.applyBlocked",
      ),
    ).toBeVisible();
    const apply = within(dialog).getByRole("button", {
      name: "tasks:scheduling.apply",
    });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(m.apply.mutate).not.toHaveBeenCalled();
  });

  it("allows a reviewed draft that moves every task out of the release", () => {
    m.calculate.mutate.mockImplementation(() => {
      m.preview = {
        ...preview(),
        tasks: [],
        scheduledCount: 0,
        changedCount: 0,
      };
      m.hasChanges = true;
    });
    render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    expect(
      within(dialog).getByRole("button", { name: "tasks:scheduling.apply" }),
    ).toBeEnabled();
  });

  it("asks before discarding staged fixes, retaining them when dismissal is cancelled", async () => {
    const view = render(<ReleasePlanDialog {...props} />);
    const dialog = openDirectPreview();
    m.hasChanges = true;
    view.rerender(<ReleasePlanDialog {...props} />);
    fireEvent.click(closeButton(dialog));
    const confirmation = screen.getByRole("alertdialog", {
      name: "tasks:releases.planning.resolution.discardTitle",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: "common:actions.cancel",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(dialog).toBeVisible();
    expect(m.discardChanges).not.toHaveBeenCalled();
    fireEvent.click(closeButton(dialog));
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:releases.planning.resolution.discard",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "tasks:releases.planning.previewTitle",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(m.discardChanges).toHaveBeenCalledOnce();
    expect(m.cancelCalculation).toHaveBeenCalledOnce();
    expect(m.apply.mutate).not.toHaveBeenCalled();
  });
});
