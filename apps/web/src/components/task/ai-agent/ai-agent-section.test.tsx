import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import getTaskAgent, { type TaskAgent } from "@/fetchers/agent/get-task-agent";
import applyTaskAgentSuggestion from "@/fetchers/agent/apply-task-agent-suggestion";
import cancelTaskShip from "@/fetchers/agent/cancel-task-ship";
import getTaskAgentPrompt from "@/fetchers/agent/get-task-agent-prompt";
import requestTaskAssessment from "@/fetchers/agent/request-task-assessment";
import shipTask from "@/fetchers/agent/ship-task";
import startTask from "@/fetchers/agent/start-task";
import submitTaskAgentAnswers from "@/fetchers/agent/submit-task-agent-answers";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { AiAgentSection } from "./ai-agent-section";
import {
  assigneeSuggestion,
  prioritySuggestion,
  testCasesSuggestion,
} from "./suggestion-fixtures";

const state = vi.hoisted(() => ({
  hasAiAgent: true,
  canUpdate: true,
  canManageSettings: false,
  canAssignTasks: true,
  canCreateTestCases: true,
}));

vi.mock("@/hooks/queries/config/use-get-config", () => ({
  default: () => ({ data: { hasAiAgent: state.hasAiAgent } }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canWorkItem: () => state.canUpdate,
    canManageSettings: () => state.canManageSettings,
    canAssignTasks: () => state.canAssignTasks,
    canCreateTestCases: () => state.canCreateTestCases,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/fetchers/agent/get-task-agent", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/agent/request-task-assessment", () => ({
  default: vi.fn(),
}));
vi.mock("@/fetchers/agent/submit-task-agent-answers", () => ({
  default: vi.fn(),
}));
vi.mock("@/fetchers/agent/ship-task", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/agent/apply-task-agent-suggestion", () => ({
  default: vi.fn(),
}));
vi.mock("@/fetchers/agent/start-task", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/agent/cancel-task-ship", () => ({ default: vi.fn() }));
vi.mock("@/fetchers/agent/get-task-agent-prompt", () => ({
  default: vi.fn(),
}));
vi.mock("@/lib/copy-to-clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const assessment: NonNullable<TaskAgent["assessment"]> = {
  score: 55,
  verdict: "needs_clarification",
  questions: [
    {
      id: "q1",
      text: "Where should exports be stored?",
      options: ["S3", "Local disk"],
      blocking: true,
    },
  ],
  suggestions: [],
  assessedAt: "2026-11-26T10:00:00.000Z",
};

const readyAssessment = {
  ...assessment,
  verdict: "ready" as const,
  questions: [],
};

function agent(overrides: Partial<TaskAgent> = {}): TaskAgent {
  return {
    enabled: true,
    autoAssess: true,
    assessment,
    stale: false,
    assessing: false,
    assessScheduledAt: null,
    lastAssessFailure: null,
    clarifications: [],
    runner: { configured: true, online: true },
    workflow: {
      todoStatus: "to-do",
      inProgress: { slug: "in-progress", name: "In Progress" },
    },
    start: { canStart: true, blockers: [], pullRequest: "opens" },
    ship: {
      canShip: false,
      blockers: ["open_questions"],
      repository: "acme/web",
      baseBranch: "main",
      branchName: "hermes/web-12-exports",
      activeRun: null,
      lastRun: null,
      events: [],
    },
    ...overrides,
  };
}

type Run = NonNullable<TaskAgent["ship"]["lastRun"]>;

function run(
  status: Run["status"],
  {
    error = null,
    kind = "ship",
  }: { error?: string | null; kind?: Run["kind"] } = {},
): Run {
  return {
    id: "r1",
    kind,
    status,
    requestedBy: null,
    cancelRequested: false,
    result: null,
    errorCode: null,
    error,
    createdAt: "2026-11-26T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
  };
}

function ready(overrides: Partial<TaskAgent["ship"]> = {}): TaskAgent {
  return agent({
    assessment: readyAssessment,
    ship: { ...agent().ship, canShip: true, blockers: [], ...overrides },
  });
}

const baseTask: Task = {
  id: "t1",
  type: "task",
  title: "Export tasks",
  number: 12,
  description: "Let people export their tasks.",
  status: "to-do",
  priority: "no-priority",
  startDate: null,
  dueDate: null,
  position: 0,
  createdAt: "2026-11-20T10:00:00.000Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  projectId: "p1",
  archivedAt: null,
};

let queryClient: QueryClient;
function section(task: Partial<Task> = {}) {
  return (
    <QueryClientProvider client={queryClient}>
      <AiAgentSection task={{ ...baseTask, ...task }} />
    </QueryClientProvider>
  );
}
function renderSection(task: Partial<Task> = {}) {
  return render(section(task));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.hasAiAgent = true;
  state.canUpdate = true;
  state.canManageSettings = false;
  state.canAssignTasks = true;
  state.canCreateTestCases = true;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(requestTaskAssessment).mockResolvedValue({ ok: true });
  vi.mocked(submitTaskAgentAnswers).mockResolvedValue({ ok: true });
  vi.mocked(shipTask).mockResolvedValue({ ok: true });
  vi.mocked(startTask).mockResolvedValue({
    moved: true,
    status: "in-progress",
    pullRequest: "queued",
  });
  vi.mocked(getTaskAgentPrompt).mockResolvedValue({
    prompt: "Implement KAN-12",
    branchName: "kan-12-export-tasks",
  });
  vi.mocked(copyToClipboard).mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

it("stays out of the way when the project has not turned the agent on", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(agent({ enabled: false }));
  const { container } = renderSection();

  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledWith("t1"));
  expect(container).toBeEmptyDOMElement();
  expect(requestTaskAssessment).not.toHaveBeenCalled();
});

it("never asks about features or on instances without the agent", () => {
  renderSection({ type: "feature" });
  state.hasAiAgent = false;
  renderSection();

  expect(getTaskAgent).not.toHaveBeenCalled();
});

it("asks for one assessment when the task was never assessed", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(agent({ assessment: null }));
  const { rerender } = renderSection();

  await waitFor(() => expect(requestTaskAssessment).toHaveBeenCalledTimes(1));
  expect(requestTaskAssessment).toHaveBeenCalledWith("t1");
  rerender(section());
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(2));
  expect(requestTaskAssessment).toHaveBeenCalledTimes(1);
});

it("checks only on request when the project turned automatic checks off", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({ assessment: null, autoAssess: false }),
  );
  renderSection();

  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.checkNow" }),
  );
  await waitFor(() => expect(requestTaskAssessment).toHaveBeenCalledTimes(1));
});

it("decides from the state fetched on open, not an outdated cached one", async () => {
  queryClient.setQueryData(["task-agent", "t1"], agent({ assessment: null }));
  vi.mocked(getTaskAgent).mockResolvedValue(agent());
  renderSection();

  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(1));
  await screen.findByText("tasks:aiAgent.readiness");
  expect(requestTaskAssessment).not.toHaveBeenCalled();
});

it("waits for a fresh state when the refresh on open fails", async () => {
  queryClient.setQueryData(["task-agent", "t1"], agent({ assessment: null }));
  vi.mocked(getTaskAgent).mockRejectedValue(
    new HttpError(429, "Too many requests"),
  );
  renderSection();

  await waitFor(() =>
    expect(queryClient.getQueryState(["task-agent", "t1"])?.status).toBe(
      "error",
    ),
  );
  expect(requestTaskAssessment).not.toHaveBeenCalled();

  vi.mocked(getTaskAgent).mockResolvedValue(agent({ assessment: null }));
  await act(() =>
    queryClient.invalidateQueries({ queryKey: ["task-agent", "t1"] }),
  );
  await waitFor(() => expect(requestTaskAssessment).toHaveBeenCalledTimes(1));
});

it("refreshes the agent state when the task text, status or planning changes", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(agent());
  const { rerender } = renderSection();
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(1));

  rerender(section());
  rerender(section({ title: "Export tasks as CSV" }));
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(2));
  rerender(section({ title: "Export tasks as CSV", userId: "u2" }));
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(3));
  rerender(
    section({
      title: "Export tasks as CSV",
      userId: "u2",
      status: "in-progress",
    }),
  );
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(4));
  // An estimate plans dates only for a task without them.
  rerender(
    section({
      title: "Export tasks as CSV",
      userId: "u2",
      status: "in-progress",
      dueDate: "2026-12-03",
    }),
  );
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(5));
  rerender(
    section({
      title: "Export tasks as CSV",
      userId: "u2",
      status: "in-progress",
      startDate: "2026-12-01",
      dueDate: "2026-12-03",
    }),
  );
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(6));
});

it("shows the readiness, questions and suggestions as three cards", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: {
        ...assessment,
        suggestions: [
          {
            kind: "description",
            id: "s1",
            title: "Edge cases",
            markdown: "- An empty project",
          },
          {
            kind: "priority",
            id: "s2",
            priority: "high",
            reason: "Customers wait for it",
          },
        ],
      },
    }),
  );
  renderSection();

  expect(
    await screen.findByRole("heading", { name: "tasks:aiAgent.readiness" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "tasks:aiAgent.questions.title" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "tasks:aiAgent.suggestions.title" }),
  ).toBeInTheDocument();
  expect(screen.getByText("- An empty project")).toBeInTheDocument();
  expect(screen.getByText("Customers wait for it")).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
});

it("keeps suggestions after work started", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: {
        ...assessment,
        suggestions: [
          {
            kind: "description",
            id: "s1",
            title: "Edge cases",
            markdown: "- An empty project",
          },
        ],
      },
    }),
  );
  renderSection({ status: "in-progress" });

  expect(
    await screen.findByRole("heading", {
      name: "tasks:aiAgent.suggestions.title",
    }),
  ).toBeInTheDocument();
});

it("opens on a blocking question and submits the chosen answer", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(agent());
  renderSection();

  fireEvent.click(await screen.findByRole("radio", { name: /Local disk/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:aiAgent.questions.submit" }),
  );

  await waitFor(() =>
    expect(submitTaskAgentAnswers).toHaveBeenCalledWith("t1", [
      { questionId: "q1", answer: "Local disk" },
    ]),
  );
  expect(requestTaskAssessment).not.toHaveBeenCalled();
});

it("keeps the remaining questions once the blocking ones are answered", async () => {
  const optional = {
    id: "q2",
    text: "Should exports include archived tasks?",
    options: ["Yes", "No"],
    blocking: false,
  };
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: {
        ...assessment,
        questions: [...assessment.questions, optional],
      },
    }),
  );
  renderSection();

  fireEvent.click(await screen.findByRole("radio", { name: /Local disk/ }));
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({ assessment: { ...assessment, questions: [optional] } }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:aiAgent.questions.submit" }),
  );

  await waitFor(() =>
    expect(
      screen.queryByText("Where should exports be stored?"),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByText(optional.text)).toBeInTheDocument();
});

it("asks questions only while the task waits in To Do or Triage", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(agent());
  const { rerender } = renderSection({ status: "in-progress" });

  await screen.findByRole("heading", { name: "tasks:aiAgent.readiness" });
  expect(screen.queryByText("Where should exports be stored?")).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "tasks:aiAgent.questions.title" }),
  ).toBeNull();

  rerender(section({ status: "triage" }));
  expect(
    await screen.findByText("Where should exports be stored?"),
  ).toBeInTheDocument();
});

it("offers no way to start a task in Triage", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: readyAssessment,
      start: {
        canStart: false,
        blockers: ["in_triage"],
        pullRequest: "opens",
      },
      ship: { ...agent().ship, blockers: ["in_triage"] },
    }),
  );
  renderSection({ status: "triage" });

  await screen.findByRole("heading", { name: "tasks:aiAgent.readiness" });
  expect(
    screen.queryByRole("button", { name: "tasks:aiAgent.startTask" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "tasks:aiAgent.ship" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "tasks:aiAgent.shipMenuLabel" }),
  ).toBeNull();
});

it("shows questions read-only to people who cannot update the task", async () => {
  state.canUpdate = false;
  vi.mocked(getTaskAgent).mockResolvedValue(agent({ assessment: null }));
  const { rerender } = renderSection();
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalled());
  expect(requestTaskAssessment).not.toHaveBeenCalled();

  queryClient.setQueryData(["task-agent", "t1"], agent());
  rerender(section());

  expect(
    await screen.findByText("Where should exports be stored?"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /submit/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /checkAgain/ })).toBeNull();
});

it("says a runner is missing instead of checking forever", async () => {
  state.canManageSettings = true;
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: null,
      assessing: true,
      runner: { configured: false, online: false },
    }),
  );
  const { rerender } = renderSection();

  expect(
    await screen.findByText(/tasks:aiAgent\.runnerMissing$/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "tasks:aiAgent.runnerMissingLink" }),
  ).toHaveAttribute("href", "/dashboard/settings/workspace/ai-agent");
  expect(screen.queryByText("tasks:aiAgent.assessing")).toBeNull();
  expect(screen.queryByText("tasks:aiAgent.runnerOffline")).toBeNull();
  expect(screen.queryByRole("button", { name: /check/i })).toBeNull();
  expect(requestTaskAssessment).not.toHaveBeenCalled();

  state.canManageSettings = false;
  rerender(section());
  expect(
    screen.getByText(/tasks:aiAgent\.runnerMissingAskAdmin/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});

it("lets people start a check waiting out the edit window now", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: readyAssessment,
      stale: true,
      assessing: true,
      assessScheduledAt: new Date(Date.now() + 30_000).toISOString(),
    }),
  );
  renderSection();

  expect(
    await screen.findByText("tasks:aiAgent.assessScheduled"),
  ).toBeInTheDocument();
  expect(screen.queryByText("tasks:aiAgent.assessing")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:aiAgent.checkNow" }),
  );
  await waitFor(() => expect(requestTaskAssessment).toHaveBeenCalledWith("t1"));
});

it("keeps the Check button focused while a check runs", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(agent());
  vi.mocked(requestTaskAssessment).mockReturnValue(
    new Promise<never>(() => {}),
  );
  renderSection();

  const check = await screen.findByRole("button", {
    name: "tasks:aiAgent.checkAgain",
  });
  check.focus();
  fireEvent.click(check);

  await waitFor(() => expect(check).toHaveAttribute("aria-disabled", "true"));
  expect(check).toBeEnabled();
  expect(check).toHaveFocus();
  fireEvent.click(check);
  expect(requestTaskAssessment).toHaveBeenCalledTimes(1);
});

it("marks the Check button unavailable while the server checks", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(agent({ assessing: true }));
  renderSection();

  expect(
    await screen.findByText("tasks:aiAgent.assessing"),
  ).toBeInTheDocument();
  const check = screen.getByRole("button", {
    name: "tasks:aiAgent.checkAgain",
  });
  expect(check).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(check);
  expect(requestTaskAssessment).not.toHaveBeenCalled();
});

it("exposes the readiness meter only once there is a score", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({ assessment: null, autoAssess: false }),
  );
  const { rerender } = renderSection();
  await screen.findByText("tasks:aiAgent.notAssessed");
  expect(screen.queryByRole("meter")).toBeNull();

  queryClient.setQueryData(["task-agent", "t1"], agent());
  rerender(section());
  expect(
    await screen.findByRole("meter", { name: "tasks:aiAgent.meterLabel" }),
  ).toBeInTheDocument();
});

it("confirms Ship, then moves focus to the run's status", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(ready());
  renderSection();

  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.ship" }),
  );
  vi.mocked(getTaskAgent).mockResolvedValue(
    ready({
      canShip: false,
      blockers: ["ship_in_progress"],
      activeRun: run("queued"),
    }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "tasks:aiAgent.shipDialog.confirm",
    }),
  );

  await waitFor(() => expect(shipTask).toHaveBeenCalledWith("t1"));
  await waitFor(() =>
    expect(document.activeElement).toHaveTextContent(
      /^tasks:aiAgent\.run\.queued$/,
    ),
  );
  expect(
    screen.queryByRole("button", { name: "tasks:aiAgent.ship" }),
  ).toBeNull();
});

it("closes Ship when the task can no longer ship, keeping focus in the card", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(ready());
  renderSection();

  const ship = await screen.findByRole("button", {
    name: "tasks:aiAgent.ship",
  });
  ship.focus();
  fireEvent.click(ship);
  await screen.findByRole("button", {
    name: "tasks:aiAgent.shipDialog.confirm",
  });
  act(() => {
    queryClient.setQueryData(["task-agent", "t1"], {
      ...ready({ canShip: false, blockers: ["assessment_outdated"] }),
      stale: true,
    });
  });

  await waitFor(() =>
    expect(
      screen.queryByRole("button", {
        name: "tasks:aiAgent.shipDialog.confirm",
      }),
    ).toBeNull(),
  );
  await waitFor(() =>
    expect(document.activeElement).toHaveTextContent(
      /^tasks:aiAgent\.readiness$/,
    ),
  );
  expect(shipTask).not.toHaveBeenCalled();
});

it("leaves focus alone when the run shows up only after a failed refresh", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(ready());
  render(
    <>
      {section()}
      <input aria-label="Comment" />
    </>,
  );

  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.ship" }),
  );
  vi.mocked(getTaskAgent).mockRejectedValue(
    new HttpError(429, "Too many requests"),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "tasks:aiAgent.shipDialog.confirm",
    }),
  );
  await waitFor(() =>
    expect(queryClient.getQueryState(["task-agent", "t1"])?.status).toBe(
      "error",
    ),
  );

  const comment = screen.getByRole("textbox", { name: "Comment" });
  comment.focus();
  act(() => {
    queryClient.setQueryData(
      ["task-agent", "t1"],
      ready({
        canShip: false,
        blockers: ["ship_in_progress"],
        activeRun: run("queued"),
      }),
    );
  });

  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "tasks:aiAgent.ship" }),
    ).toBeNull(),
  );
  expect(comment).toHaveFocus();
});

it("shows where a failed run stopped, and ships again only through Ship", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: readyAssessment,
      ship: {
        ...agent().ship,
        canShip: true,
        blockers: [],
        lastRun: run("failed", { error: "Tests failed" }),
        events: [
          {
            id: 1,
            kind: "step",
            message: "Running the tests",
            createdAt: "2026-11-26T10:00:00.000Z",
          },
        ],
      },
    }),
  );
  renderSection();

  expect(await screen.findByText("Tests failed")).toBeInTheDocument();
  expect(screen.queryByText("Running the tests")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:aiAgent.run.logLabel" }),
  );
  expect(
    await screen.findByRole("list", { name: "tasks:aiAgent.run.logLabel" }),
  ).toHaveTextContent("Running the tests");
  expect(screen.queryByRole("log")).toBeNull();
  expect(screen.queryByRole("button", { name: /tryAgain/ })).toBeNull();
  expect(
    screen.getByRole("button", { name: "tasks:aiAgent.ship" }),
  ).toBeInTheDocument();
});

it("starts a task that isn't ready, then moves focus to the new run", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(agent());
  renderSection();

  const start = await screen.findByRole("button", {
    name: "tasks:aiAgent.startTask",
  });
  expect(
    screen.queryByRole("button", { name: "tasks:aiAgent.ship" }),
  ).toBeNull();
  start.focus();
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      start: {
        canStart: false,
        blockers: ["run_in_progress"],
        pullRequest: "opens",
      },
      ship: {
        ...agent().ship,
        blockers: ["open_questions", "ship_in_progress"],
        activeRun: run("queued", { kind: "start" }),
      },
    }),
  );
  fireEvent.click(start);

  await waitFor(() =>
    expect(startTask).toHaveBeenCalledWith("t1", { pullRequest: true }),
  );
  await waitFor(() =>
    expect(document.activeElement).toHaveTextContent(
      /^tasks:aiAgent\.run\.startQueued$/,
    ),
  );
  expect(toast.success).toHaveBeenCalledWith(
    "tasks:aiAgent.toast.startedWithPullRequest",
    expect.anything(),
  );
});

it("moves focus to the score when Start opened no pull request", async () => {
  vi.mocked(startTask).mockResolvedValue({
    moved: true,
    status: "in-progress",
    pullRequest: "no_repository",
  });
  vi.mocked(getTaskAgent).mockResolvedValue(agent());
  const { rerender } = renderSection();

  const start = await screen.findByRole("button", {
    name: "tasks:aiAgent.startTask",
  });
  start.focus();
  fireEvent.click(start);
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(2));
  rerender(section({ status: "in-progress" }));

  await waitFor(() =>
    expect(document.activeElement).toHaveTextContent(
      /^tasks:aiAgent\.readiness$/,
    ),
  );
  expect(
    screen.queryByRole("button", { name: "tasks:aiAgent.startTask" }),
  ).toBeNull();
  expect(toast.success).toHaveBeenCalledWith(
    "tasks:aiAgent.toast.started",
    expect.anything(),
  );
});

it("offers Start task and Copy prompt beside Ship when the task is ready", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(ready());
  renderSection();

  expect(
    await screen.findByRole("button", { name: "tasks:aiAgent.ship" }),
  ).not.toHaveAttribute("aria-disabled");
  fireEvent.click(
    screen.getByRole("button", { name: "tasks:aiAgent.shipMenuLabel" }),
  );
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "tasks:aiAgent.startTask",
    "tasks:aiAgent.copyPrompt",
  ]);
  fireEvent.click(
    screen.getByRole("menuitem", { name: "tasks:aiAgent.startTask" }),
  );
  await waitFor(() =>
    expect(startTask).toHaveBeenCalledWith("t1", { pullRequest: true }),
  );
  expect(shipTask).not.toHaveBeenCalled();
});

it("keeps the menu when no runner can ship a ready task", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: readyAssessment,
      autoAssess: false,
      runner: { configured: false, online: false },
      start: {
        canStart: true,
        blockers: [],
        pullRequest: "runner_missing",
      },
      ship: {
        ...agent().ship,
        canShip: false,
        blockers: ["runner_missing", "no_repository"],
      },
    }),
  );
  renderSection();

  const ship = await screen.findByRole("button", {
    name: "tasks:aiAgent.ship",
  });
  expect(ship).toHaveAttribute("aria-disabled", "true");
  expect(ship).toHaveAccessibleDescription(
    "tasks:aiAgent.blockers.noRepository",
  );
  fireEvent.click(ship);
  expect(
    screen.queryByRole("button", { name: "tasks:aiAgent.shipDialog.confirm" }),
  ).toBeNull();

  fireEvent.click(
    screen.getByRole("button", { name: "tasks:aiAgent.shipMenuLabel" }),
  );
  expect(
    await screen.findByRole("menuitem", { name: "tasks:aiAgent.copyPrompt" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("menuitem", { name: "tasks:aiAgent.startTask" }),
  ).toBeInTheDocument();
});

it("describes a blocked Ship only by blockers the card lists", async () => {
  // The runner went after the check judged the task ready.
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: readyAssessment,
      autoAssess: false,
      runner: { configured: false, online: false },
      start: {
        canStart: true,
        blockers: [],
        pullRequest: "runner_missing",
      },
      ship: { ...agent().ship, canShip: false, blockers: ["runner_missing"] },
    }),
  );
  renderSection();

  const ship = await screen.findByRole("button", {
    name: "tasks:aiAgent.ship",
  });
  expect(ship).toHaveAttribute("aria-disabled", "true");
  expect(ship).not.toHaveAttribute("aria-describedby");
  expect(screen.queryByText("tasks:aiAgent.blockers.title")).toBeNull();
  expect(screen.getByText(/tasks:aiAgent\.runnerMissing/)).toBeInTheDocument();
});

it("stops loading the prompt once its menu goes with the Ship button", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(ready());
  const { rerender } = renderSection();
  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.shipMenuLabel" }),
  );
  await screen.findByRole("menuitem", { name: "tasks:aiAgent.copyPrompt" });
  await waitFor(() => expect(getTaskAgentPrompt).toHaveBeenCalledTimes(1));

  // Someone else starts the task while the menu is open.
  rerender(section({ status: "in-progress" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "tasks:aiAgent.shipMenuLabel" }),
    ).toBeNull(),
  );
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(2));
  const promptLoads = vi.mocked(getTaskAgentPrompt).mock.calls.length;
  await act(() =>
    queryClient.invalidateQueries({ queryKey: ["task-agent", "t1"] }),
  );

  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(3));
  expect(getTaskAgentPrompt).toHaveBeenCalledTimes(promptLoads);
});

it("copies the prompt before moving the task", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(ready());
  renderSection();

  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.shipMenuLabel" }),
  );
  await waitFor(() =>
    expect(
      queryClient.getQueryState(["task-agent", "t1", "prompt"])?.status,
    ).toBe("success"),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "tasks:aiAgent.copyPrompt" }),
  );

  expect(copyToClipboard).toHaveBeenCalledWith("Implement KAN-12");
  await waitFor(() =>
    expect(startTask).toHaveBeenCalledWith("t1", { pullRequest: false }),
  );
  expect(vi.mocked(copyToClipboard).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(startTask).mock.invocationCallOrder[0],
  );
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith(
      "tasks:aiAgent.toast.promptCopied",
      expect.anything(),
    ),
  );
});

it("copies a prompt that is still loading during the click", async () => {
  let resolvePrompt: (value: {
    prompt: string;
    branchName: string;
  }) => void = () => {};
  vi.mocked(getTaskAgentPrompt).mockReturnValue(
    new Promise((resolve) => {
      resolvePrompt = resolve;
    }),
  );
  // Like the browser, the copy finishes once the text arrives.
  vi.mocked(copyToClipboard).mockImplementation(async (text) => {
    await text;
    return true;
  });
  vi.mocked(getTaskAgent).mockResolvedValue(ready());
  renderSection();

  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.shipMenuLabel" }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "tasks:aiAgent.copyPrompt" }),
  );

  expect(copyToClipboard).toHaveBeenCalledTimes(1);
  const [source] = vi.mocked(copyToClipboard).mock.calls[0];
  expect(source).toBeInstanceOf(Promise);
  expect(startTask).not.toHaveBeenCalled();
  resolvePrompt({ prompt: "Implement KAN-12", branchName: "kan-12" });
  await expect(source).resolves.toBe("Implement KAN-12");
  await waitFor(() =>
    expect(startTask).toHaveBeenCalledWith("t1", { pullRequest: false }),
  );
});

it("shows the prompt to copy by hand when the browser refuses", async () => {
  vi.mocked(copyToClipboard).mockResolvedValue(false);
  vi.mocked(getTaskAgent).mockResolvedValue(ready());
  renderSection();

  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.shipMenuLabel" }),
  );
  await waitFor(() =>
    expect(
      queryClient.getQueryState(["task-agent", "t1", "prompt"])?.status,
    ).toBe("success"),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "tasks:aiAgent.copyPrompt" }),
  );

  expect(
    await screen.findByRole("textbox", {
      name: "tasks:aiAgent.copyPromptDialog.label",
    }),
  ).toHaveValue("Implement KAN-12");
  expect(startTask).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", {
      name: "tasks:aiAgent.copyPromptDialog.moveToInProgress",
    }),
  );
  await waitFor(() =>
    expect(startTask).toHaveBeenCalledWith("t1", { pullRequest: false }),
  );
});

it("keeps Move to In Progress focused while Start runs and after it fails", async () => {
  vi.mocked(copyToClipboard).mockResolvedValue(false);
  let refuseStart: (error: unknown) => void = () => {};
  vi.mocked(startTask).mockReturnValue(
    new Promise((_resolve, reject) => {
      refuseStart = reject;
    }),
  );
  vi.mocked(getTaskAgent).mockResolvedValue(ready());
  renderSection();
  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.shipMenuLabel" }),
  );
  await waitFor(() =>
    expect(
      queryClient.getQueryState(["task-agent", "t1", "prompt"])?.status,
    ).toBe("success"),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "tasks:aiAgent.copyPrompt" }),
  );
  const move = await screen.findByRole("button", {
    name: "tasks:aiAgent.copyPromptDialog.moveToInProgress",
  });
  act(() => move.focus());

  fireEvent.click(move);
  await waitFor(() => expect(move).toHaveAttribute("aria-disabled", "true"));
  expect(move).toBeEnabled();
  expect(move).toHaveFocus();
  fireEvent.click(move);
  expect(startTask).toHaveBeenCalledTimes(1);

  await act(async () =>
    refuseStart(
      new HttpError(409, "Not startable", { code: "AI_AGENT_NOT_STARTABLE" }),
    ),
  );
  await waitFor(() => expect(move).not.toHaveAttribute("aria-disabled"));
  expect(move).toHaveFocus();
  expect(toast.error).toHaveBeenCalledWith("tasks:aiAgent.errors.notStartable");
});

it("moves the task back in this window when a queued run is cancelled", async () => {
  vi.mocked(cancelTaskShip).mockResolvedValue({ ok: true });
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      start: {
        canStart: false,
        blockers: ["run_in_progress"],
        pullRequest: "opens",
      },
      ship: {
        ...agent().ship,
        blockers: ["open_questions", "ship_in_progress"],
        activeRun: run("queued", { kind: "start" }),
      },
    }),
  );
  // The board and the open task still show where Start moved it.
  queryClient.setQueryData(["task", "t1"], {
    ...baseTask,
    status: "in-progress",
  });
  queryClient.setQueryData(["tasks", "p1"], []);
  renderSection({ status: "in-progress" });

  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.run.cancel" }),
  );

  await waitFor(() => expect(cancelTaskShip).toHaveBeenCalledWith("t1"));
  await waitFor(() =>
    expect(queryClient.getQueryState(["task", "t1"])?.isInvalidated).toBe(true),
  );
  expect(queryClient.getQueryState(["tasks", "p1"])?.isInvalidated).toBe(true);
});

function withSuggestions(
  suggestions: NonNullable<TaskAgent["assessment"]>["suggestions"],
) {
  return agent({ assessment: { ...assessment, suggestions } });
}

const applyLabel = "tasks:aiAgent.suggestions.applyLabel";
const dismissLabel = "tasks:aiAgent.suggestions.dismissLabel";

it("applies a field suggestion and says what it set", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    withSuggestions([prioritySuggestion]),
  );
  vi.mocked(applyTaskAgentSuggestion).mockResolvedValue({
    ok: true,
    kind: "priority",
    assigneeChanged: false,
    datesChanged: false,
  });
  renderSection();

  fireEvent.click(await screen.findByRole("button", { name: applyLabel }));

  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith(
      "tasks:aiAgent.toast.appliedField.priority",
      expect.anything(),
    ),
  );
  expect(applyTaskAgentSuggestion).toHaveBeenCalledWith("t1", "s-priority");
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(2));
});

it("says when an estimate also assigned and planned the task", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    withSuggestions([prioritySuggestion]),
  );
  vi.mocked(applyTaskAgentSuggestion).mockResolvedValue({
    ok: true,
    kind: "estimate",
    assigneeChanged: true,
    datesChanged: true,
  });
  renderSection();

  fireEvent.click(await screen.findByRole("button", { name: applyLabel }));

  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith(
      "tasks:aiAgent.toast.appliedField.estimateWithAssignee",
      expect.anything(),
    ),
  );
});

it("offers only Dismiss on suggestions the viewer can't apply", async () => {
  state.canAssignTasks = false;
  state.canCreateTestCases = false;
  vi.mocked(getTaskAgent).mockResolvedValue(
    withSuggestions([assigneeSuggestion, testCasesSuggestion()]),
  );
  renderSection();

  expect(
    await screen.findAllByRole("button", { name: dismissLabel }),
  ).toHaveLength(2);
  expect(screen.queryByRole("button", { name: applyLabel })).toBeNull();
});

it("refreshes away a suggestion that no longer fits", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    withSuggestions([prioritySuggestion]),
  );
  vi.mocked(applyTaskAgentSuggestion).mockRejectedValue(
    new HttpError(409, "Outdated", { code: "AI_AGENT_SUGGESTION_OUTDATED" }),
  );
  renderSection();

  fireEvent.click(await screen.findByRole("button", { name: applyLabel }));

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "tasks:aiAgent.errors.suggestionOutdated",
    ),
  );
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(2));
});

it("explains which days the assignee is away when dates are refused", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(
    withSuggestions([prioritySuggestion]),
  );
  vi.mocked(applyTaskAgentSuggestion).mockRejectedValue(
    new HttpError(409, "Away on 2026-12-02", { code: "TASK_ASSIGNEE_AWAY" }),
  );
  renderSection();

  fireEvent.click(await screen.findByRole("button", { name: applyLabel }));

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ description: expect.any(String) }),
    ),
  );
  expect(toast.error).not.toHaveBeenCalledWith("tasks:aiAgent.errors.apply");
});
