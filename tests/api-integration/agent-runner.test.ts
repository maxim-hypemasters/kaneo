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
import { createProjectFixture } from "./helpers/fixtures";

vi.mock("../../apps/api/src/events", async (original) => {
  const { awaitEventHandlers } = await import("./helpers/await-event-handlers");
  return awaitEventHandlers(original);
});

beforeEach(async () => {
  await resetTestDatabase();
});
afterEach(() => vi.unstubAllEnvs());

async function readyToShip() {
  const ctx = await setupAgentWorkspace();
  await ctx.enable();
  const token = await ctx.createRunnerToken();
  await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
  await ctx.assess(token, READY_ASSESSMENT);
  const shipped = await ctx.call(
    ctx.member,
    "POST",
    `/agent/task/${ctx.task.id}/ship`,
  );
  expect(shipped.status).toBe(200);
  return { ...ctx, token };
}

const expireLease = (runId: string) =>
  db
    .update(agentRunTable)
    .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
    .where(eq(agentRunTable.id, runId));

const agentComments = (taskId: string) =>
  db
    .select()
    .from(schema.activityTable)
    .where(
      and(
        eq(schema.activityTable.taskId, taskId),
        eq(schema.activityTable.externalSource, "hermes"),
      ),
    );

const runStatus = async (runId: string) =>
  (
    await db
      .select({
        status: agentRunTable.status,
        errorCode: agentRunTable.errorCode,
      })
      .from(agentRunTable)
      .where(eq(agentRunTable.id, runId))
  )[0];

describe("agent runner protocol", () => {
  it("rejects missing, wrong and revoked tokens", async () => {
    const ctx = await setupAgentWorkspace();
    await expectError(
      await ctx.runnerCall("", "POST", "/claim", { kinds: ["assess"] }),
      401,
      "AI_AGENT_RUNNER_UNAUTHORIZED",
    );
    await expectError(
      await ctx.runnerCall("kar_wrong", "POST", "/claim", {
        kinds: ["assess"],
      }),
      401,
    );
    const token = await ctx.createRunnerToken();
    expect(await ctx.claim(token)).toBeNull();
    const rotated = await ctx.createRunnerToken();
    await expectError(
      await ctx.runnerCall(token, "POST", "/claim", { kinds: ["assess"] }),
      401,
    );
    await ctx.call(
      ctx.admin,
      "DELETE",
      `/agent/workspace/${ctx.workspace.id}/runner`,
    );
    await expectError(
      await ctx.runnerCall(rotated, "POST", "/claim", { kinds: ["assess"] }),
      401,
    );
  });

  it("marks the runner online once it polls", async () => {
    const ctx = await setupAgentWorkspace();
    const token = await ctx.createRunnerToken();
    expect((await ctx.getAgent()).runner).toEqual({
      configured: true,
      online: false,
    });
    await ctx.claim(token);
    expect((await ctx.getAgent()).runner.online).toBe(true);
  });

  it("gives a run to one claimer only", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => ctx.claim(token, ["assess"])),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const claimed = results.find(Boolean)!;
    expect(claimed.context).toMatchObject({
      task: { ticketId: "HUB-7", title: "Login fails on Firefox" },
      project: { repository: "acme/app", instructions: "Run pnpm test." },
      branchName: "hub-7",
    });
    expect(claimed.context.resultSchema).toMatchObject({ type: "object" });
  });

  it("keeps runs inside the runner's workspace", async () => {
    const ctx = await readyToShip();
    const other = await setupAgentWorkspace();
    const otherToken = await other.createRunnerToken();
    expect(await other.claim(otherToken)).toBeNull();
    const claimed = await ctx.claim(ctx.token, ["ship"]);
    await expectError(
      await other.runCall(otherToken, claimed!, "heartbeat"),
      404,
      "AI_AGENT_RUN_NOT_FOUND",
    );
  });

  it("reports a failed check until the next one succeeds", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    const claimed = await ctx.claim(token, ["assess"]);
    await ctx.runCall(token, claimed!, "fail", {
      code: "agent_failed",
      message: "Hermes failed: credentials or agent init failed",
    });
    const failed = (await ctx.getAgent()) as unknown as {
      lastAssessFailure: unknown;
    };
    expect(failed.lastAssessFailure).toMatchObject({
      code: "agent_failed",
      message: "Hermes failed: credentials or agent init failed",
      sameInput: true,
    });

    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    await ctx.assess(token, READY_ASSESSMENT);
    const recovered = (await ctx.getAgent()) as unknown as {
      lastAssessFailure: unknown;
    };
    expect(recovered.lastAssessFailure).toBeNull();
  });

  it("validates assessments so the runner can ask for a correction", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    const claimed = await ctx.claim(token, ["assess"]);
    const response = await ctx.runCall(token, claimed!, "assessment", {
      ...READY_ASSESSMENT,
      score: 200,
    });
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("score");
  });

  it("ships: progress, pull request link and agent comment", async () => {
    const ctx = await readyToShip();
    const claimed = await ctx.claim(ctx.token, ["ship"]);
    expect(claimed!.run.kind).toBe("ship");

    const beat = await ctx.runCall(ctx.token, claimed!, "heartbeat");
    expect(await beat.json()).toEqual({ cancelRequested: false });
    await ctx.runCall(ctx.token, claimed!, "events", {
      events: [
        { kind: "step", message: "Cloned acme/app" },
        { kind: "tool", message: "pnpm test" },
      ],
    });
    let agent = await ctx.getAgent();
    expect(agent.ship.activeRun).toMatchObject({ status: "running" });
    expect(agent.ship.events.map((event) => event.message)).toEqual([
      "Cloned acme/app",
      "pnpm test",
    ]);

    const prUrl = "https://github.com/acme/app/pull/12";
    const result = { prUrl, branch: "hub-7", summary: "Fixed the form." };
    expect(
      (await ctx.runCall(ctx.token, claimed!, "ship-result", result)).status,
    ).toBe(200);
    await expectError(
      await ctx.runCall(ctx.token, claimed!, "ship-result", result),
      409,
      "AI_AGENT_RUN_NOT_RUNNING",
    );

    agent = await ctx.getAgent();
    expect(agent.ship.activeRun).toBeNull();
    expect(agent.ship.lastRun).toMatchObject({
      status: "succeeded",
      result,
    });
    const links = await db
      .select()
      .from(schema.externalLinkTable)
      .where(eq(schema.externalLinkTable.taskId, ctx.task.id));
    expect(links).toMatchObject([{ url: prUrl, title: "Pull request #12" }]);
    const comments = await agentComments(ctx.task.id);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.content).toContain(prUrl);
    expect(comments[0]!.userId).toBeNull();
  });

  it("cancels a queued Ship at once and a running one through the runner", async () => {
    const ctx = await readyToShip();
    const cancel = () =>
      ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/cancel`);
    expect((await cancel()).status).toBe(200);
    expect((await ctx.getAgent()).ship.lastRun).toMatchObject({
      status: "cancelled",
    });
    await expectError(await cancel(), 409, "AI_AGENT_NO_ACTIVE_RUN");

    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/ship`);
    const claimed = await ctx.claim(ctx.token, ["ship"]);
    expect((await cancel()).status).toBe(200);
    const beat = await ctx.runCall(ctx.token, claimed!, "heartbeat");
    expect(await beat.json()).toEqual({ cancelRequested: true });
    await ctx.runCall(ctx.token, claimed!, "fail", {
      code: "cancelled",
      message: "Cancelled",
    });
    expect((await ctx.getAgent()).ship.lastRun).toMatchObject({
      status: "cancelled",
    });
  });

  it("turns a Ship run's questions into open questions", async () => {
    const ctx = await readyToShip();
    const claimed = await ctx.claim(ctx.token, ["ship"]);
    await ctx.runCall(ctx.token, claimed!, "fail", {
      code: "needs_input",
      message: "Two login forms exist",
      questions: [
        {
          text: "Fix the modal or the page form?",
          options: ["Both", "Page only"],
          blocking: true,
        },
      ],
    });
    const agent = await ctx.getAgent();
    expect(agent.ship.lastRun).toMatchObject({ status: "failed" });
    expect(agent.assessment).toMatchObject({
      verdict: "needs_clarification",
      questions: [{ text: "Fix the modal or the page form?" }],
    });
    expect(agent.ship.blockers).toEqual(["open_questions"]);
  });

  it("reclaims an abandoned run once, then fails it", async () => {
    const ctx = await readyToShip();
    const first = await ctx.claim(ctx.token, ["ship"]);
    expect(first!.run.attempt).toBe(1);
    await expireLease(first!.run.id);
    const second = await ctx.claim(ctx.token, ["ship"]);
    expect(second!.run).toMatchObject({ id: first!.run.id, attempt: 2 });
    await expireLease(first!.run.id);
    expect(await ctx.claim(ctx.token, ["ship"])).toBeNull();
    expect((await ctx.getAgent()).ship.lastRun).toMatchObject({
      status: "failed",
    });
  });

  it("refuses a superseded attempt and a request without one", async () => {
    const ctx = await readyToShip();
    const first = await ctx.claim(ctx.token, ["ship"]);
    await expireLease(first!.run.id);
    const second = await ctx.claim(ctx.token, ["ship"]);
    expect(second!.run.attempt).toBe(2);

    await expectError(
      await ctx.runCall(ctx.token, first!, "heartbeat"),
      409,
      "AI_AGENT_RUN_NOT_RUNNING",
    );
    await expectError(
      await ctx.runCall(ctx.token, first!, "ship-result", {
        prUrl: "https://github.com/acme/app/pull/3",
        branch: "hub-7",
        summary: "Stale attempt.",
      }),
      409,
      "AI_AGENT_RUN_NOT_RUNNING",
    );
    for (const attempt of [undefined, "two"])
      await expectError(
        await ctx.runnerCall(
          ctx.token,
          "POST",
          `/runs/${second!.run.id}/heartbeat`,
          undefined,
          attempt,
        ),
        409,
        "AI_AGENT_RUN_NOT_RUNNING",
      );
    expect((await ctx.runCall(ctx.token, second!, "heartbeat")).status).toBe(
      200,
    );
    expect(await runStatus(second!.run.id)).toMatchObject({
      status: "running",
    });
  });

  it("records the input the finishing attempt was claimed with", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    const first = await ctx.claim(token, ["assess"]);
    await db
      .update(schema.taskTable)
      .set({ description: "Rewritten while the check ran." })
      .where(eq(schema.taskTable.id, ctx.task.id));
    await expireLease(first!.run.id);
    const second = await ctx.claim(token, ["assess"]);
    expect(second!.context.task.description).toBe(
      "Rewritten while the check ran.",
    );
    await expectError(
      await ctx.runCall(token, first!, "assessment", READY_ASSESSMENT),
      409,
      "AI_AGENT_RUN_NOT_RUNNING",
    );
    await ctx.runCall(token, second!, "assessment", READY_ASSESSMENT);
    expect(await ctx.getAgent()).toMatchObject({
      stale: false,
      ship: { canShip: true },
    });
  });

  it("cancels a Ship whose runner is gone instead of resuming it", async () => {
    const ctx = await readyToShip();
    const claimed = await ctx.claim(ctx.token, ["ship"]);
    expect(
      (await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/cancel`))
        .status,
    ).toBe(200);
    expect((await ctx.getAgent()).ship.activeRun).toMatchObject({
      cancelRequested: true,
    });
    await expireLease(claimed!.run.id);

    expect(await ctx.claim(ctx.token, ["ship"])).toBeNull();
    expect(await runStatus(claimed!.run.id)).toEqual({
      status: "cancelled",
      errorCode: "cancelled",
    });
    const comments = await agentComments(ctx.task.id);
    expect(comments.map((comment) => comment.content)).toEqual([
      "Stopped working on this task.",
    ]);
  });

  it("cancels a running Ship at once when its runner is gone", async () => {
    const ctx = await readyToShip();
    const claimed = await ctx.claim(ctx.token, ["ship"]);
    await expireLease(claimed!.run.id);
    expect(
      (await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/cancel`))
        .status,
    ).toBe(200);
    const agent = await ctx.getAgent();
    expect(agent.ship.activeRun).toBeNull();
    expect(agent.ship.lastRun).toMatchObject({
      status: "cancelled",
      errorCode: "cancelled",
    });
    expect(agent.ship.blockers).toEqual([]);
    expect(await ctx.claim(ctx.token, ["ship"])).toBeNull();
  });

  it("does not ship a task that changed after Ship was requested", async () => {
    const ctx = await readyToShip();
    await db
      .update(schema.taskTable)
      .set({ description: "Also migrate auth to OAuth." })
      .where(eq(schema.taskTable.id, ctx.task.id));

    expect(await ctx.claim(ctx.token, ["ship"])).toBeNull();
    const agent = await ctx.getAgent();
    expect(agent.ship.activeRun).toBeNull();
    expect(agent.ship.lastRun).toMatchObject({
      status: "failed",
      errorCode: "assessment_outdated",
    });
    expect(agent.ship.blockers).toEqual(["assessment_outdated"]);
    expect(await agentComments(ctx.task.id)).toHaveLength(1);
  });

  it("keeps a comment for each Ship that pushes to the same pull request", async () => {
    const ctx = await readyToShip();
    const result = {
      prUrl: "https://github.com/acme/app/pull/12",
      branch: "hub-7",
      summary: "First pass.",
    };
    const first = await ctx.claim(ctx.token, ["ship"]);
    await ctx.runCall(ctx.token, first!, "ship-result", result);
    expect(
      (await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/ship`))
        .status,
    ).toBe(200);
    const second = await ctx.claim(ctx.token, ["ship"]);
    await ctx.runCall(ctx.token, second!, "ship-result", {
      ...result,
      summary: "Second pass.",
    });

    const comments = await agentComments(ctx.task.id);
    expect(comments.map((comment) => comment.content).sort()).toEqual([
      "Pushed to [Pull request #12](https://github.com/acme/app/pull/12) from `hub-7`.\n\nFirst pass.",
      "Pushed to [Pull request #12](https://github.com/acme/app/pull/12) from `hub-7`.\n\nSecond pass.",
    ]);
  });

  it("gives the agent related tasks of the task's own project only", async () => {
    const ctx = await setupAgentWorkspace();
    await ctx.enable();
    const token = await ctx.createRunnerToken();
    const { project: privateProject } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
      slug: "hr",
    });
    const [sibling, hidden] = await db
      .insert(schema.taskTable)
      .values([
        { projectId: ctx.project.id, title: "Login page redesign", number: 8 },
        { projectId: privateProject.id, title: "Prepare layoffs", number: 12 },
      ])
      .returning();
    await db.insert(schema.taskRelationTable).values([
      {
        sourceTaskId: ctx.task.id,
        targetTaskId: sibling!.id,
        relationType: "related",
      },
      {
        sourceTaskId: hidden!.id,
        targetTaskId: ctx.task.id,
        relationType: "related",
      },
    ]);
    await ctx.call(ctx.member, "POST", `/agent/task/${ctx.task.id}/assess`);
    const claimed = await ctx.claim(token, ["assess"]);
    expect(claimed!.context.relatedTasks).toEqual([
      { ticketId: "HUB-8", title: "Login page redesign", relation: "related" },
    ]);
  });

  it("answers every runner route with 404 when DISABLE_AI_AGENT=true", async () => {
    const ctx = await readyToShip();
    vi.stubEnv("DISABLE_AI_AGENT", "true");
    await expectError(
      await ctx.runnerCall(ctx.token, "POST", "/claim", { kinds: ["ship"] }),
      404,
      "AI_AGENT_DISABLED",
    );
    const [run] = await db
      .select()
      .from(agentRunTable)
      .where(
        and(
          eq(agentRunTable.taskId, ctx.task.id),
          eq(agentRunTable.kind, "ship"),
        ),
      );
    expect(run!.status).toBe("queued");
    for (const action of [
      "heartbeat",
      "events",
      "assessment",
      "ship-result",
      "fail",
    ] as const)
      await expectError(
        await ctx.runnerCall(
          ctx.token,
          "POST",
          `/runs/${run!.id}/${action}`,
          {},
          1,
        ),
        404,
        "AI_AGENT_DISABLED",
      );
  });
});
