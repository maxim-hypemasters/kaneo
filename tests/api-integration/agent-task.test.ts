import { and, eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import {
  agentRunTable,
  taskAgentAssessmentTable,
} from "../../apps/api/src/database/schema";
import { moveTaskForWorkRun } from "../../apps/api/src/agent/controllers/move-task-for-work-run";
import updateTaskStatus from "../../apps/api/src/task/controllers/update-task-status";
import {
  type AgentSuggestionView,
  addPlanningCandidates,
  expectError,
  READY_ASSESSMENT,
  setupAgentWorkspace,
} from "./helpers/agent";
import { resetTestDatabase } from "./helpers/database";
import { insertTimeOff } from "./helpers/time-off";

vi.mock("../../apps/api/src/events", async (original) => {
  const { awaitEventHandlers } = await import("./helpers/await-event-handlers");
  return awaitEventHandlers(original);
});

beforeEach(async () => {
  await resetTestDatabase();
});
afterEach(() => vi.unstubAllEnvs());

const queuedAssessRuns = (taskId: string) =>
  db
    .select()
    .from(agentRunTable)
    .where(
      and(
        eq(agentRunTable.taskId, taskId),
        eq(agentRunTable.kind, "assess"),
        eq(agentRunTable.status, "queued"),
      ),
    );

describe("AI agent on a task", () => {
  it("stays off until an admin enables it for the project", async () => {
    const ctx = await setupAgentWorkspace();
    const agent = await ctx.getAgent();
    expect(agent.enabled).toBe(false);
    expect(agent.assessment).toBeNull();
    expect(agent.ship.blockers).toEqual([
      "agent_disabled",
      "no_repository",
      "runner_missing",
      "not_assessed",
    ]);
    await expectError(
      await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`),
      409,
      "AI_AGENT_NOT_ENABLED",
    );
  });

  it("lets only admins change settings, and only with a session for tokens", async () => {
    const ctx = await setupAgentWorkspace();
    const settings = `/agent/project/${ctx.project.id}/settings`;
    await expectError(await ctx.call(ctx.member, "GET", settings), 403);
    await expectError(
      await ctx.call(ctx.member, "PUT", settings, {
        enabled: true,
        autoAssess: true,
        repository: "acme/app",
        baseBranch: "main",
        instructions: "",
        readyThreshold: 80,
      }),
      403,
    );
    await expectError(
      await ctx.call(ctx.admin, "PUT", settings, {
        enabled: true,
        autoAssess: true,
        repository: "not a repo",
        baseBranch: "--force",
        instructions: "",
        readyThreshold: 80,
      }),
      400,
    );
    await ctx.enable();
    const saved = await ctx.call(ctx.admin, "GET", settings);
    expect(await saved.json()).toMatchObject({
      enabled: true,
      repository: "acme/app",
      runnerConfigured: false,
    });
    await expectError(
      await ctx.call(
        ctx.member,
        "POST",
        `/agent/workspace/${ctx.workspace.id}/runner/token`,
      ),
      403,
    );
  });

  it("assesses, takes answers, and ships once ready", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();

    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    expect(await queuedAssessRuns(ctx.task.id)).toHaveLength(1);
    expect((await ctx.getAgent()).assessing).toBe(true);

    await ctx.assess(token, {
      ...READY_ASSESSMENT,
      score: 85,
      questions: [
        {
          text: "Which Firefox version?",
          options: ["Latest", "ESR"],
          blocking: true,
        },
      ],
      suggestions: [{ title: "Expected", markdown: "Expected: signed in." }],
    });
    let agent = await ctx.getAgent();
    expect(agent.assessment).toMatchObject({
      score: 85,
      verdict: "needs_clarification",
    });
    expect(agent.ship).toMatchObject({
      canShip: false,
      blockers: ["open_questions"],
      branchName: "bugfix/hub-7/login-fails-on-firefox",
    });

    const questionId = agent.assessment!.questions[0]!.id;
    await expectError(
      await ctx.call(ctx.viewer, "POST", `/agent/task/${ctx.task.id}/answers`, {
        answers: [{ questionId, answer: "ESR" }],
      }),
      403,
    );
    expect(
      (
        await ctx.call(
          ctx.member,
          "POST",
          `/agent/task/${ctx.task.id}/answers`,
          { answers: [{ questionId, answer: "ESR" }] },
        )
      ).status,
    ).toBe(200);
    agent = await ctx.getAgent();
    expect(agent.clarifications).toMatchObject([
      { question: "Which Firefox version?", answer: "ESR" },
    ]);
    expect(agent.assessment!.questions).toEqual([]);
    expect(agent).toMatchObject({ stale: true, assessing: true });
    expect(agent.ship.blockers).toEqual(["assessment_outdated"]);

    const suggestionId = agent.assessment!.suggestions[0]!.id;
    expect(
      (
        await ctx.call(
          ctx.member,
          "POST",
          `/agent/task/${ctx.task.id}/suggestions/${suggestionId}/apply`,
        )
      ).status,
    ).toBe(200);
    const [task] = await db
      .select({ description: schema.taskTable.description })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, ctx.task.id));
    expect(task!.description).toBe(
      "Steps: open /login and submit.\n\nExpected: signed in.",
    );

    // The runner reads the task as it is now, answers included.
    const claimed = await ctx.claim(token, ["assess"]);
    expect(claimed!.context.clarifications).toEqual([
      { question: "Which Firefox version?", answer: "ESR" },
    ]);
    expect(claimed!.context.task.description).toContain("Expected: signed in.");
    await ctx.runCall(token, claimed!, "assessment", READY_ASSESSMENT);
    agent = await ctx.getAgent();
    expect(agent).toMatchObject({ stale: false, assessing: false });
    expect(agent.ship).toMatchObject({ canShip: true, blockers: [] });

    await expectError(
      await ctx.call(ctx.viewer, "POST", `/agent/task/${ctx.task.id}/ship`),
      403,
    );
    expect(
      (await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/ship`))
        .status,
    ).toBe(200);
    await expectError(
      await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/ship`),
      409,
      "AI_AGENT_NOT_SHIPPABLE",
    );
    agent = await ctx.getAgent();
    expect(agent.ship.activeRun).toMatchObject({
      kind: "ship",
      status: "queued",
    });
    expect(agent.ship.blockers).toEqual(["ship_in_progress"]);
    expect(await ctx.taskStatus()).toBe("in-progress");
  });

  it("refuses to ship an outdated assessment", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    await ctx.assess(token, READY_ASSESSMENT);
    await db
      .update(schema.taskTable)
      .set({ title: "Login fails everywhere" })
      .where(eq(schema.taskTable.id, ctx.task.id));

    const response = await ctx.call(
      ctx.member,
      "POST",
      `/agent/task/${ctx.task.id}/ship`,
    );
    await expectError(response, 409);
    expect((await ctx.getAgent()).ship.blockers).toEqual([
      "assessment_outdated",
    ]);
  });

  it("hides the task from members of other workspaces", async () => {
    const ctx = await setupAgentWorkspace();
    const other = await setupAgentWorkspace();
    await expectError(
      await other.call(other.member, "GET", `/agent/task/${ctx.task.id}`),
      404,
    );
  });

  it("assesses user edits automatically, once per burst", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable({ autoAssess: true });
    for (const description of ["First edit", "Second edit"]) {
      const response = await ctx.call(
        ctx.member,
        "PUT",
        `/task/description/${ctx.task.id}`,
        { description },
      );
      expect(response.status).toBe(200);
    }
    const runs = await queuedAssessRuns(ctx.task.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.notBefore.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(runs[0]!.requestedByUserId).toBeNull();
  });

  it("does not assess automatically when auto-assess is off", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable({ autoAssess: false });
    await ctx.call(ctx.member, "PUT", `/task/description/${ctx.task.id}`, {
      description: "Edited",
    });
    expect(await queuedAssessRuns(ctx.task.id)).toHaveLength(0);
  });

  it("cancels queued work when the agent is turned off", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    await ctx.enable({ enabled: false });
    const [run] = await db
      .select({ status: agentRunTable.status })
      .from(agentRunTable)
      .where(eq(agentRunTable.taskId, ctx.task.id));
    expect(run!.status).toBe("cancelled");
  });

  it("refuses features", async () => {
    const ctx = await setupAgentWorkspace();
    const [feature] = await db
      .insert(schema.taskTable)
      .values({
        projectId: ctx.project.id,
        title: "Feature",
        type: "feature",
        status: null,
        columnId: null,
        priority: null,
      })
      .returning();
    await expectError(
      await ctx.call(ctx.member, "GET", `/agent/task/${feature!.id}`),
      400,
      "AI_AGENT_NOT_WORK_ITEM",
    );
  });

  it("judges readiness by the project's current threshold", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable({ readyThreshold: 80 });
    const token = await ctx.createRunnerToken();
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    await ctx.assess(token, READY_ASSESSMENT);
    expect((await ctx.getAgent()).assessment!.verdict).toBe("ready");

    await ctx.enable({ readyThreshold: 95 });
    const agent = await ctx.getAgent();
    expect(agent.assessment!.verdict).toBe("not_ready");
    expect(agent.ship.blockers).toEqual(["not_ready"]);
    await expectError(
      await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/ship`),
      409,
      "AI_AGENT_NOT_SHIPPABLE",
    );
  });

  it("does not assess drafts created with a Feature or milestone", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable({ autoAssess: true });
    const queuedTitles = async () =>
      (
        await db
          .select({ title: schema.taskTable.title })
          .from(agentRunTable)
          .innerJoin(
            schema.taskTable,
            eq(agentRunTable.taskId, schema.taskTable.id),
          )
          .where(eq(agentRunTable.status, "queued"))
      ).map((row) => row.title);

    const feature = await ctx.call(
      ctx.admin,
      "POST",
      `/task/${ctx.project.id}`,
      {
        title: "Checkout",
        description: "",
        type: "feature",
        featureComposition: {
          newTasks: [
            { title: "Cart draft" },
            { title: "Pay bug", type: "bug" },
          ],
        },
      },
    );
    expect(feature.status).toBe(200);
    const { id: featureId } = (await feature.json()) as { id: string };
    const milestone = await ctx.call(
      ctx.admin,
      "POST",
      `/milestone/feature/${featureId}`,
      { title: "Beta", newTasks: [{ title: "Milestone draft" }] },
    );
    expect(milestone.status).toBe(200);
    expect(await queuedTitles()).toEqual([]);

    const single = await ctx.call(
      ctx.admin,
      "POST",
      `/task/${ctx.project.id}`,
      { title: "Fix the header", description: "It overlaps the menu." },
    );
    expect(single.status).toBe(200);
    expect(await queuedTitles()).toEqual(["Fix the header"]);
  });

  it("answers every agent route with 404 when DISABLE_AI_AGENT=true", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable({ autoAssess: true });
    vi.stubEnv("DISABLE_AI_AGENT", "true");
    const task = `/agent/task/${ctx.task.id}`;
    const settings = `/agent/project/${ctx.project.id}/settings`;
    const runner = `/agent/workspace/${ctx.workspace.id}/runner`;
    const routes: Array<[string, string, unknown?]> = [
      ["GET", task],
      ["POST", `${task}/assess`],
      [
        "POST",
        `${task}/answers`,
        { answers: [{ questionId: "q", answer: "a" }] },
      ],
      ["POST", `${task}/suggestions/s/apply`],
      ["DELETE", `${task}/suggestions/s`],
      ["POST", `${task}/ship`],
      ["POST", `${task}/start`],
      ["GET", `${task}/prompt`],
      ["POST", `${task}/cancel`],
      ["GET", settings],
      ["PUT", settings, {}],
      ["GET", runner],
      ["POST", `${runner}/token`],
      ["DELETE", runner],
    ];
    for (const [method, path, body] of routes)
      await expectError(
        await ctx.call(ctx.admin, method, path, body),
        404,
        "AI_AGENT_DISABLED",
      );

    const edited = await ctx.call(
      ctx.member,
      "PUT",
      `/task/description/${ctx.task.id}`,
      { description: "Edited while the agent is off" },
    );
    expect(edited.status).toBe(200);
    expect(await queuedAssessRuns(ctx.task.id)).toHaveLength(0);
  });
});

const workRuns = (taskId: string) =>
  db
    .select({
      kind: agentRunTable.kind,
      status: agentRunTable.status,
      movedTask: agentRunTable.movedTask,
    })
    .from(agentRunTable)
    .where(
      and(eq(agentRunTable.taskId, taskId), eq(agentRunTable.kind, "start")),
    );

describe("Start, Ship and the workflow", () => {
  const start = (
    ctx: Awaited<ReturnType<typeof setupAgentWorkspace>>,
    body?: unknown,
  ) => ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/start`, body);

  it("reports the workflow and what Start would do", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable({ repository: null });
    const agent = await ctx.getAgent();
    expect(agent.workflow).toEqual({
      todoStatus: "to-do",
      inProgress: { slug: "in-progress", name: "In Progress" },
    });
    expect(agent.start).toEqual({
      canStart: true,
      blockers: [],
      pullRequest: "no_repository",
    });
  });

  it("only moves the task when there is no repository", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable({ repository: null });
    await expectError(
      await ctx.call(ctx.viewer, "POST", `/agent/task/${ctx.task.id}/start`),
      403,
    );
    const response = await start(ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      moved: true,
      status: "in-progress",
      pullRequest: "no_repository",
    });
    expect(await ctx.taskStatus()).toBe("in-progress");
    expect(await workRuns(ctx.task.id)).toEqual([]);
    const [activity] = await db
      .select({ userId: schema.activityTable.userId })
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, ctx.task.id),
          eq(schema.activityTable.type, "status_changed"),
        ),
      );
    expect(activity!.userId).toBe(ctx.member.id);

    // Never moved backwards or sideways: a second Start leaves it alone.
    expect(await (await start(ctx)).json()).toMatchObject({
      moved: false,
      status: "in-progress",
    });
  });

  it("queues a draft pull request when the runner can push", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    expect((await ctx.getAgent()).start.pullRequest).toBe("runner_cannot_push");
    await ctx.claim(token, ["start"], true);
    expect((await ctx.getAgent()).start.pullRequest).toBe("opens");

    const response = await start(ctx);
    expect(await response.json()).toEqual({
      moved: true,
      status: "in-progress",
      pullRequest: "queued",
    });
    expect(await workRuns(ctx.task.id)).toEqual([
      { kind: "start", status: "queued", movedTask: true },
    ]);
    const agent = await ctx.getAgent();
    expect(agent.ship.activeRun).toMatchObject({
      kind: "start",
      status: "queued",
    });
    expect(agent.start).toMatchObject({
      canStart: false,
      blockers: ["run_in_progress"],
    });

    await expectError(await start(ctx), 409, "AI_AGENT_NOT_STARTABLE");
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    await ctx.assess(token, READY_ASSESSMENT);
    await expectError(
      await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/ship`),
      409,
      "AI_AGENT_NOT_SHIPPABLE",
    );
  });

  it("queues nothing when no pull request is wanted", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    await ctx.claim(token, ["start"], true);
    const response = await start(ctx, { pullRequest: false });
    expect(await response.json()).toEqual({
      moved: true,
      status: "in-progress",
      pullRequest: "not_requested",
    });
    expect(await workRuns(ctx.task.id)).toEqual([]);
  });

  it("refuses Start and Ship in Triage without moving the task", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    await ctx.assess(token, READY_ASSESSMENT);
    await ctx.setTaskStatus("triage");

    const refused = await start(ctx);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      code: "AI_AGENT_NOT_STARTABLE",
      issues: [{ path: "start", message: "in_triage" }],
    });
    const shipped = await ctx.call(
      ctx.member,
      "POST",
      `/agent/task/${ctx.task.id}/ship`,
    );
    expect(shipped.status).toBe(409);
    expect(await shipped.json()).toMatchObject({
      code: "AI_AGENT_NOT_SHIPPABLE",
      issues: [{ path: "ship", message: "in_triage" }],
    });
    expect(await ctx.taskStatus()).toBe("triage");
    const agent = await ctx.getAgent();
    expect(agent.start.blockers).toEqual(["in_triage"]);
    expect(agent.ship.blockers).toEqual(["in_triage"]);
  });

  it("ships a task in In Review without moving it", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    await ctx.assess(token, READY_ASSESSMENT);
    await ctx.setTaskStatus("in-review");
    expect(
      (await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/ship`))
        .status,
    ).toBe(200);
    expect(await ctx.taskStatus()).toBe("in-review");
    const [run] = await db
      .select({ movedTask: agentRunTable.movedTask })
      .from(agentRunTable)
      .where(
        and(
          eq(agentRunTable.taskId, ctx.task.id),
          eq(agentRunTable.kind, "ship"),
        ),
      );
    expect(run!.movedTask).toBe(false);
  });

  it("refuses a status move when the task left the expected status", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.setTaskStatus("in-review");
    await expect(
      updateTaskStatus({
        id: ctx.task.id,
        status: "in-progress",
        currentUserId: null,
        expectedStatus: "to-do",
      }),
    ).rejects.toMatchObject({ status: 409, code: "TASK_STATUS_CONFLICT" });
    expect(await ctx.taskStatus()).toBe("in-review");
  });

  it("drops the queued run when the move hits a status conflict", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const queueRun = async (status: "queued" | "running") =>
      (
        await db
          .insert(agentRunTable)
          .values({ taskId: ctx.task.id, kind: "ship", status, inputHash: "h" })
          .returning({ id: agentRunTable.id })
      )[0]!.id;
    const runIds = async () =>
      (
        await db
          .select({ id: agentRunTable.id })
          .from(agentRunTable)
          .where(eq(agentRunTable.taskId, ctx.task.id))
      ).map((row) => row.id);
    // Someone moved the task after Ship read it in To Do.
    await ctx.setTaskStatus("in-review");
    const move = (runId: string) =>
      moveTaskForWorkRun(
        { id: ctx.task.id, projectId: ctx.project.id, status: "to-do" },
        ctx.member.id,
        runId,
      );

    await expect(move(await queueRun("queued"))).rejects.toMatchObject({
      status: 409,
      code: "TASK_STATUS_CONFLICT",
    });
    expect(await runIds()).toEqual([]);
    expect((await ctx.getAgent()).ship.lastRun).toBeNull();

    // A run a runner already claimed is its to finish.
    const claimed = await queueRun("running");
    await expect(move(claimed)).rejects.toMatchObject({ status: 409 });
    expect(await runIds()).toEqual([claimed]);
  });

  it("builds a prompt for the caller's own agent", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const path = `/agent/task/${ctx.task.id}/prompt`;
    await expectError(await ctx.call(ctx.viewer, "GET", path), 403);

    const response = await ctx.call(ctx.member, "GET", path);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { prompt, branchName } = (await response.json()) as {
      prompt: string;
      branchName: string;
    };
    expect(branchName).toBe("bugfix/hub-7/login-fails-on-firefox");
    expect(prompt).toContain("Login fails on Firefox");
    expect(prompt).toContain("branch bugfix/hub-7/login-fails-on-firefox:");
    expect(prompt).toContain('"HUB-7: Login fails on Firefox"');
    // Project instructions are for people who may read the agent settings.
    expect(prompt).not.toContain("Run pnpm test.");
    const admin = await (await ctx.call(ctx.admin, "GET", path)).json();
    expect((admin as { prompt: string }).prompt).toContain("Run pnpm test.");
    expect(await ctx.taskStatus()).toBe("to-do");
  });
});

describe("Typed suggestions", () => {
  type Ctx = Awaited<ReturnType<typeof setupAgentWorkspace>>;
  type Candidates = Awaited<ReturnType<typeof addPlanningCandidates>>;

  const recommendations = (ctx: Ctx, candidates: Candidates) => ({
    assignee: { userId: ctx.member.id, reason: "Fixed the last login bug" },
    priority: { priority: "high", reason: "Blocks sign-in" },
    feature: {
      featureId: candidates.feature.id,
      milestoneId: candidates.milestone.id,
      reason: "Sign-in work",
    },
    release: { releaseId: candidates.release.id, reason: "Next release" },
    estimate: { minutes: 960, reason: "Two days" },
    testCases: {
      cases: [
        {
          title: "Signs in on Firefox",
          steps: "Open /login and submit.",
          expectedResult: "The dashboard opens.",
        },
        { title: "Shows an error for a wrong password" },
      ],
      reason: "Covers the repro",
    },
  });

  async function assessed(
    pick: (ctx: Ctx, candidates: Candidates) => Record<string, unknown> = (
      ctx,
      candidates,
    ) => recommendations(ctx, candidates),
  ) {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    const candidates = await addPlanningCandidates(ctx.project.id, ctx.task.id);
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    await ctx.assess(token, {
      ...READY_ASSESSMENT,
      recommendations: pick(ctx, candidates),
    });
    const suggestions = async (as = ctx.member) =>
      (await ctx.getAgent(as)).assessment!.suggestions;
    const find = async (kind: string, as = ctx.member) =>
      (await suggestions(as)).find((item) => item.kind === kind);
    const apply = (
      suggestion: AgentSuggestionView | undefined,
      as = ctx.member,
    ) =>
      ctx.call(
        as,
        "POST",
        `/agent/task/${ctx.task.id}/suggestions/${suggestion!.id}/apply`,
      );
    const taskRow = async () =>
      (
        await db
          .select()
          .from(schema.taskTable)
          .where(eq(schema.taskTable.id, ctx.task.id))
      )[0]!;
    return { ...ctx, token, candidates, suggestions, find, apply, taskRow };
  }

  it("returns field suggestions with the names of what they point at", async () => {
    const ctx = await assessed();
    expect(await ctx.suggestions()).toMatchObject([
      {
        kind: "assignee",
        user: { id: ctx.member.id, name: "Mo Member" },
        reason: "Fixed the last login bug",
      },
      { kind: "priority", priority: "high", reason: "Blocks sign-in" },
      {
        kind: "feature",
        feature: { id: ctx.candidates.feature.id, title: "Sign-in" },
        milestone: { id: ctx.candidates.milestone.id, title: "Beta" },
      },
      {
        kind: "release",
        release: { id: ctx.candidates.release.id, name: "Spring" },
      },
      // Members can't assign, so nobody to plan the dates for.
      { kind: "estimate", minutes: 960, keepsDates: false, plan: null },
      {
        kind: "test_cases",
        target: "bug",
        milestone: null,
        cases: [
          {
            title: "Signs in on Firefox",
            steps: "Open /login and submit.",
            expectedResult: "The dashboard opens.",
          },
          {
            title: "Shows an error for a wrong password",
            steps: null,
            expectedResult: null,
          },
        ],
      },
    ]);
    // An admin may assign, so the dates are planned for the suggested person.
    expect((await ctx.find("estimate", ctx.admin))!.plan).toMatchObject({
      assignee: { id: ctx.member.id, name: "Mo Member" },
      suggestedAssignee: true,
    });
  });

  it("hides a suggestion once its field is set by hand, and won't apply it", async () => {
    const ctx = await assessed();
    const priority = await ctx.find("priority");
    expect(
      (
        await ctx.call(ctx.member, "PUT", `/task/priority/${ctx.task.id}`, {
          priority: "low",
        })
      ).status,
    ).toBe(200);
    expect(await ctx.find("priority")).toBeUndefined();
    await expectError(
      await ctx.apply(priority),
      409,
      "AI_AGENT_SUGGESTION_OUTDATED",
    );
    expect((await ctx.taskRow()).priority).toBe("low");
  });

  it("applies a priority as the caller", async () => {
    const ctx = await assessed();
    const response = await ctx.apply(await ctx.find("priority"));
    expect(await response.json()).toEqual({
      ok: true,
      kind: "priority",
      assigneeChanged: false,
      datesChanged: false,
    });
    expect((await ctx.taskRow()).priority).toBe("high");
    expect(await ctx.find("priority")).toBeUndefined();
  });

  it("needs task:assign to apply an assignee", async () => {
    const ctx = await assessed();
    const assignee = await ctx.find("assignee");
    await expectError(await ctx.apply(assignee), 403, "MISSING_PERMISSION");
    expect((await ctx.taskRow()).userId).toBeNull();
    expect(await ctx.find("assignee")).toBeDefined();

    expect(await (await ctx.apply(assignee, ctx.admin)).json()).toMatchObject({
      kind: "assignee",
      assigneeChanged: true,
    });
    expect((await ctx.taskRow()).userId).toBe(ctx.member.id);
  });

  it("applies a feature together with its milestone", async () => {
    const ctx = await assessed();
    expect((await ctx.apply(await ctx.find("feature"))).status).toBe(200);
    const task = await ctx.taskRow();
    expect(task.featureId).toBe(ctx.candidates.feature.id);
    expect(task.milestoneId).toBe(ctx.candidates.milestone.id);
    expect(await ctx.find("feature")).toBeUndefined();
  });

  it("sets only the estimate when nobody can be planned for", async () => {
    const ctx = await assessed();
    const response = await ctx.apply(await ctx.find("estimate"));
    expect(await response.json()).toMatchObject({
      kind: "estimate",
      assigneeChanged: false,
      datesChanged: false,
    });
    const task = await ctx.taskRow();
    expect(task).toMatchObject({
      estimateSeconds: 960 * 60,
      userId: null,
      startDate: null,
      dueDate: null,
    });
    expect(await ctx.find("assignee")).toBeDefined();
  });

  describe("on a fixed day", () => {
    afterEach(() => vi.useRealTimers());

    it("plans estimate dates around weekends and time off, assigning the suggested person", async () => {
      const ctx = await assessed((ctx) => ({
        assignee: { userId: ctx.member.id, reason: "Knows the code" },
        estimate: { minutes: 960, reason: "Two days" },
      }));
      // Friday 15:00 UTC, the project's planning zone. Set after the check,
      // whose queued run the database's clock must find due.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2027-01-08T15:00:00Z"));
      await insertTimeOff({
        workspaceId: ctx.workspace.id,
        userId: ctx.member.id,
        startDate: "2027-01-11",
        endDate: "2027-01-11",
        status: "approved",
      });
      const estimate = await ctx.find("estimate", ctx.admin);
      // Two hours on Friday, Monday off, eight on Tuesday, six on Wednesday.
      expect(estimate!.plan).toEqual({
        assignee: { id: ctx.member.id, name: "Mo Member" },
        suggestedAssignee: true,
        startDate: "2027-01-08T15:00:00.000Z",
        dueDate: "2027-01-13T15:00:00.000Z",
      });

      const response = await ctx.apply(estimate, ctx.admin);
      expect(await response.json()).toMatchObject({
        kind: "estimate",
        assigneeChanged: true,
        datesChanged: true,
      });
      expect(await ctx.taskRow()).toMatchObject({
        userId: ctx.member.id,
        estimateSeconds: 960 * 60,
        startDate: new Date("2027-01-08T15:00:00Z"),
        dueDate: new Date("2027-01-13T15:00:00Z"),
      });
      // Assigning settled the assignee suggestion too.
      expect(await ctx.suggestions(ctx.admin)).toEqual([]);
    });
  });

  it("creates the bug's test cases together, once", async () => {
    const ctx = await assessed();
    const testCases = await ctx.find("test_cases");
    expect((await ctx.apply(testCases)).status).toBe(200);
    const rows = await db
      .select({
        title: schema.testCaseTable.title,
        steps: schema.testCaseTable.steps,
        bugId: schema.testCaseTable.bugId,
      })
      .from(schema.testCaseTable)
      .where(eq(schema.testCaseTable.projectId, ctx.project.id))
      .orderBy(schema.testCaseTable.createdAt);
    expect(rows).toEqual([
      {
        title: "Signs in on Firefox",
        steps: "Open /login and submit.",
        bugId: ctx.task.id,
      },
      {
        title: "Shows an error for a wrong password",
        steps: null,
        bugId: ctx.task.id,
      },
    ]);
    await expectError(
      await ctx.apply(testCases),
      404,
      "AI_AGENT_SUGGESTION_NOT_FOUND",
    );
  });

  it("keeps a dismissed kind dismissed after another check", async () => {
    const ctx = await assessed();
    const priority = await ctx.find("priority");
    expect(
      (
        await ctx.call(
          ctx.member,
          "DELETE",
          `/agent/task/${ctx.task.id}/suggestions/${priority!.id}`,
        )
      ).status,
    ).toBe(200);
    const [row] = await db
      .select({
        dismissed: taskAgentAssessmentTable.dismissedSuggestionKinds,
      })
      .from(taskAgentAssessmentTable)
      .where(eq(taskAgentAssessmentTable.taskId, ctx.task.id));
    expect(row!.dismissed).toEqual(["priority"]);

    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    const claimed = await ctx.claim(ctx.token, ["assess"]);
    const planning = claimed!.context.planning as { missing: string[] };
    expect(planning.missing).not.toContain("priority");
    await ctx.runCall(ctx.token, claimed!, "assessment", {
      ...READY_ASSESSMENT,
      recommendations: recommendations(ctx, ctx.candidates),
    });
    const kinds = (await ctx.suggestions()).map((item) => item.kind);
    expect(kinds).not.toContain("priority");
    expect(kinds).toContain("estimate");
  });
});
