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
import { agentRunTable } from "../../apps/api/src/database/schema";
import {
  expectError,
  READY_ASSESSMENT,
  setupAgentWorkspace,
} from "./helpers/agent";
import { resetTestDatabase } from "./helpers/database";

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
      branchName: "hub-7",
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
    expect(agent.ship.activeRun).toMatchObject({ status: "queued" });
    expect(agent.ship.blockers).toEqual(["ship_in_progress"]);
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
