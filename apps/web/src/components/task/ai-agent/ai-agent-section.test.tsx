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
import requestTaskAssessment from "@/fetchers/agent/request-task-assessment";
import shipTask from "@/fetchers/agent/ship-task";
import submitTaskAgentAnswers from "@/fetchers/agent/submit-task-agent-answers";
import { HttpError } from "@/lib/http-error";
import { AiAgentSection } from "./ai-agent-section";
import type { AgentTaskFields } from "./use-refresh-on-task-edit";

const state = vi.hoisted(() => ({
  hasAiAgent: true,
  canUpdate: true,
  canManageSettings: false,
}));

vi.mock("@/hooks/queries/config/use-get-config", () => ({
  default: () => ({ data: { hasAiAgent: state.hasAiAgent } }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canWorkItem: () => state.canUpdate,
    canManageSettings: () => state.canManageSettings,
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
  summary: "Clear goal, but storage is undecided.",
  checklist: [{ key: "goal", label: "Goal is clear", status: "met" }],
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

function run(
  status: NonNullable<TaskAgent["ship"]["lastRun"]>["status"],
  error: string | null = null,
): NonNullable<TaskAgent["ship"]["lastRun"]> {
  return {
    id: "r1",
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

const baseTask: AgentTaskFields = {
  id: "t1",
  type: "task",
  title: "Export tasks",
  description: "Let people export their tasks.",
  status: "to-do",
  archivedAt: null,
};

let queryClient: QueryClient;
function section(task: Partial<AgentTaskFields> = {}) {
  return (
    <QueryClientProvider client={queryClient}>
      <AiAgentSection task={{ ...baseTask, ...task }} />
    </QueryClientProvider>
  );
}
function renderSection(task: Partial<AgentTaskFields> = {}) {
  return render(section(task));
}

beforeEach(() => {
  vi.clearAllMocks();
  state.hasAiAgent = true;
  state.canUpdate = true;
  state.canManageSettings = false;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(requestTaskAssessment).mockResolvedValue({ ok: true });
  vi.mocked(submitTaskAgentAnswers).mockResolvedValue({ ok: true });
  vi.mocked(shipTask).mockResolvedValue({ ok: true });
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

it("refreshes the agent state when the task text changes", async () => {
  vi.mocked(getTaskAgent).mockResolvedValue(agent());
  const { rerender } = renderSection();
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(1));

  rerender(section());
  rerender(section({ title: "Export tasks as CSV" }));
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(2));
  rerender(section({ title: "Export tasks as CSV", status: "archived" }));
  await waitFor(() => expect(getTaskAgent).toHaveBeenCalledTimes(3));
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

it("keeps the panel open once the blocking questions are answered", async () => {
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
  expect(
    screen.getByRole("button", { name: "tasks:aiAgent.questionCount" }),
  ).toHaveAttribute("aria-expanded", "true");
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
  const ready = agent({
    assessment: readyAssessment,
    ship: { ...agent().ship, canShip: true, blockers: [] },
  });
  vi.mocked(getTaskAgent).mockResolvedValue(ready);
  renderSection();

  fireEvent.click(
    await screen.findByRole("button", { name: "tasks:aiAgent.ship" }),
  );
  vi.mocked(getTaskAgent).mockResolvedValue(
    agent({
      assessment: readyAssessment,
      ship: {
        ...ready.ship,
        canShip: false,
        blockers: ["ship_in_progress"],
        activeRun: run("queued"),
      },
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

it("closes Ship when the task can no longer ship, keeping focus in the bar", async () => {
  const ready = agent({
    assessment: readyAssessment,
    ship: { ...agent().ship, canShip: true, blockers: [] },
  });
  vi.mocked(getTaskAgent).mockResolvedValue(ready);
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
    queryClient.setQueryData(
      ["task-agent", "t1"],
      agent({
        assessment: readyAssessment,
        stale: true,
        ship: {
          ...ready.ship,
          canShip: false,
          blockers: ["assessment_outdated"],
        },
      }),
    );
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
  const ready = agent({
    assessment: readyAssessment,
    ship: { ...agent().ship, canShip: true, blockers: [] },
  });
  vi.mocked(getTaskAgent).mockResolvedValue(ready);
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
      agent({
        assessment: readyAssessment,
        ship: {
          ...ready.ship,
          canShip: false,
          blockers: ["ship_in_progress"],
          activeRun: run("queued"),
        },
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
        lastRun: run("failed", "Tests failed"),
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
