import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";
import { readMilestoneExecution } from "../../apps/api/src/milestone/execution";

beforeEach(resetTestDatabase);
async function setup(role = "owner") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const call = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const base = `/project-schedule/${fixture.project.id}`;
  const calendar = {
    timeZone: "UTC",
    weeklyIntervals: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startMinute: 540,
      endMinute: 1020,
    })),
    timeOff: [],
  };
  const configure = async () => {
    expect(
      (
        await call("PUT", `${base}/settings`, {
          timeZone: "UTC",
          estimateDayMinutes: 480,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "PUT",
          `/work-calendar/${member.workspace.id}/${member.user.id}`,
          calendar,
        )
      ).status,
    ).toBe(200);
  };
  const preview = async () => {
    const response = await call("POST", `${base}/preview`, {
      planFrom: "2027-01-04T09:00:00Z",
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  const apply = (proposal: {
    asOf: string;
    planFrom: string;
    revision: string;
    generation: number;
  }) =>
    call("POST", `${base}/apply`, {
      asOf: proposal.asOf,
      planFrom: proposal.planFrom,
      revision: proposal.revision,
      generation: proposal.generation,
    });
  const leaf = (values: Partial<typeof schema.taskTable.$inferInsert> = {}) =>
    insertTask(fixture.project.id, {
      userId: member.user.id,
      estimateSeconds: 7200,
      ...values,
    });
  return {
    ...member,
    ...fixture,
    app,
    call,
    base,
    configure,
    preview,
    apply,
    leaf,
    calendar,
  };
}

describe("project effort planning", () => {
  it("reports no changed placements when re-previewing the same applied plan", async () => {
    const ctx = await setup();
    await ctx.configure();
    await ctx.leaf({ estimateSeconds: 5400 });
    await ctx.leaf({ type: "bug", estimateSeconds: 3600 });
    const first = await ctx.preview();
    expect(first.changedCount).toBe(2);
    expect((await ctx.apply(first)).status).toBe(200);
    const repeated = await ctx.preview();
    expect(repeated.tasks).toEqual(first.tasks);
    expect(repeated.changedCount).toBe(0);
  });

  it("ranks active work ahead of ready To Do when an explicit Planned column comes first", async () => {
    const ctx = await setup();
    await ctx.configure();
    await db
      .update(schema.columnTable)
      .set({ position: sql`${schema.columnTable.position} + 1` })
      .where(eq(schema.columnTable.projectId, ctx.project.id));
    const [planned] = await db
      .insert(schema.columnTable)
      .values({
        projectId: ctx.project.id,
        name: "Planned",
        slug: "planned",
        position: 0,
        isFinal: false,
      })
      .returning();
    const todo = await ctx.leaf({
      priority: "urgent",
      columnId: ctx.columns.todo.id,
    });
    const active = await ctx.leaf({
      priority: "no-priority",
      status: "in-progress",
      columnId: ctx.columns.inProgress.id,
    });
    const backlog = await ctx.leaf({
      priority: "urgent",
      status: "planned",
      columnId: planned!.id,
    });
    const proposal = await ctx.preview();
    expect(
      proposal.tasks.find(
        (row: { taskId: string }) => row.taskId === active.id,
      ),
    ).toMatchObject({
      start: "2027-01-04T09:00:00.000Z",
      end: "2027-01-04T11:00:00.000Z",
    });
    expect(
      proposal.tasks.find((row: { taskId: string }) => row.taskId === todo.id),
    ).toMatchObject({
      start: "2027-01-04T11:00:00.000Z",
      end: "2027-01-04T13:00:00.000Z",
    });
    expect(proposal.diagnostics).toContainEqual({
      taskId: backlog.id,
      reason: "backlog",
    });
  });

  it("uses accessible external applied finishes and hides unavailable blocker metadata", async () => {
    const ctx = await setup("admin");
    await ctx.configure();
    const other = await createProjectFixture({
      workspaceId: ctx.workspace.id,
      name: "Private dependency project",
    });
    const blocker = await insertTask(other.project.id, {
      title: "Confidential blocker title",
      userId: ctx.user.id,
      startDate: new Date("2027-01-05T09:00:00Z"),
      dueDate: new Date("2027-01-05T12:00:00Z"),
      scheduleSegments: [
        { start: "2027-01-05T09:00:00.000Z", end: "2027-01-05T12:00:00.000Z" },
      ],
    });
    await db
      .update(schema.projectTable)
      .set({ scheduleGeneration: 1 })
      .where(eq(schema.projectTable.id, other.project.id));
    const target = await ctx.leaf();
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: blocker.id,
      targetTaskId: target.id,
      relationType: "blocks",
    });
    const visible = await ctx.preview();
    expect(
      visible.tasks.find(
        (task: { taskId: string }) => task.taskId === target.id,
      ),
    ).toMatchObject({
      start: "2027-01-05T12:00:00.000Z",
      end: "2027-01-05T14:00:00.000Z",
    });
    await db
      .update(schema.projectTable)
      .set({ scheduleGeneration: 0 })
      .where(eq(schema.projectTable.id, other.project.id));
    expect((await ctx.preview()).diagnostics).toContainEqual({
      taskId: target.id,
      reason: "external_dependency_unavailable",
    });
    await db
      .update(schema.projectTable)
      .set({ scheduleGeneration: 1 })
      .where(eq(schema.projectTable.id, other.project.id));
    await restrictToProjects(ctx.workspace.id, ctx.user.id, [ctx.project.id]);
    const hidden = await ctx.preview();
    expect(
      hidden.tasks.find(
        (task: { taskId: string }) => task.taskId === target.id,
      ),
    ).toMatchObject({
      start: null,
      end: null,
      reason: "external_dependency_unavailable",
    });
    expect(JSON.stringify(hidden)).not.toContain(blocker.id);
    expect(JSON.stringify(hidden)).not.toContain(blocker.title);
    expect(JSON.stringify(hidden)).not.toContain("2027-01-05T12:00");
    expect((await ctx.apply(visible)).status).toBe(409);
  });

  it("respects project-local release starts and reports feasible finishes after release boundaries", async () => {
    const ctx = await setup();
    await ctx.configure();
    expect(
      (
        await ctx.call(
          "PUT",
          `/work-calendar/${ctx.workspace.id}/${ctx.user.id}`,
          {
            ...ctx.calendar,
            weeklyIntervals: ctx.calendar.weeklyIntervals.map((interval) => ({
              ...interval,
              startMinute: 0,
              endMinute: 1440,
            })),
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx.call("PUT", `${ctx.base}/settings`, {
          timeZone: "America/New_York",
          estimateDayMinutes: 480,
        })
      ).status,
    ).toBe(200);
    const [release] = await db
      .insert(schema.releaseTable)
      .values({
        projectId: ctx.project.id,
        name: "Planning boundary",
        startDate: "2027-01-05",
        codeFreezeDate: "2027-01-05",
        submissionDate: "2027-01-05",
      })
      .returning();
    const task = await ctx.leaf({
      estimateSeconds: 32 * 3600,
      releaseId: release!.id,
    });
    const proposal = await ctx.preview();
    expect(
      proposal.tasks.find((row: { taskId: string }) => row.taskId === task.id),
    ).toMatchObject({
      start: "2027-01-05T05:00:00.000Z",
      end: "2027-01-06T13:00:00.000Z",
    });
    expect(proposal.warnings).toEqual(
      expect.arrayContaining([
        { taskId: task.id, reason: "after_code_freeze" },
        { taskId: task.id, reason: "after_submission" },
      ]),
    );
    const historyBefore = await db
      .select()
      .from(schema.releaseProgressEventTable);
    const rejected = await ctx.apply(proposal);
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({
      code: "PLAN_AFTER_CODE_FREEZE",
    });
    expect(
      (
        await ctx.call("PUT", `/release/${release!.id}`, {
          codeFreezeDate: "2027-01-06",
          submissionDate: "2027-01-06",
        })
      ).status,
    ).toBe(200);
    const revised = await ctx.preview();
    expect(revised.warnings).toEqual([]);
    expect((await ctx.apply(revised)).status).toBe(200);
    expect(await db.select().from(schema.releaseProgressEventTable)).toEqual(
      historyBefore,
    );
  });

  it("invalidates previews after working-calendar edits without replacing published placement", async () => {
    const ctx = await setup();
    await ctx.configure();
    const task = await ctx.leaf();
    expect((await ctx.apply(await ctx.preview())).status).toBe(200);
    const old = await ctx.preview();
    expect(
      (
        await ctx.call(
          "PUT",
          `/work-calendar/${ctx.workspace.id}/${ctx.user.id}`,
          {
            ...ctx.calendar,
            timeOff: [
              { start: "2027-01-04T09:00:00Z", end: "2027-01-04T12:00:00Z" },
            ],
          },
        )
      ).status,
    ).toBe(200);
    expect((await ctx.apply(old)).status).toBe(409);
    expect(await (await ctx.call("GET", ctx.base)).json()).toMatchObject({
      generation: 1,
      outdated: true,
      tasks: [
        {
          taskId: task.id,
          start: "2027-01-04T09:00:00.000Z",
          end: "2027-01-04T11:00:00.000Z",
        },
      ],
    });
    const next = await ctx.preview();
    expect(next.tasks[0]).toMatchObject({
      start: "2027-01-04T12:00:00.000Z",
      end: "2027-01-04T14:00:00.000Z",
    });
    expect((await ctx.apply(next)).status).toBe(200);
  });

  it("keeps an exclusive midnight finish on the prior milestone day after completion", async () => {
    const ctx = await setup();
    await ctx.configure();
    expect(
      (
        await ctx.call(
          "PUT",
          `/work-calendar/${ctx.workspace.id}/${ctx.user.id}`,
          {
            ...ctx.calendar,
            weeklyIntervals: ctx.calendar.weeklyIntervals.map((interval) => ({
              ...interval,
              startMinute: 0,
              endMinute: 1440,
            })),
          },
        )
      ).status,
    ).toBe(200);
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const [milestone] = await db
      .insert(schema.milestoneTable)
      .values({
        featureId: feature.id,
        title: "Midnight boundary",
        position: 0,
      })
      .returning();
    const task = await ctx.leaf({
      featureId: feature.id,
      milestoneId: milestone!.id,
    });
    const response = await ctx.call("POST", `${ctx.base}/preview`, {
      planFrom: "2027-01-04T22:00:00Z",
    });
    expect(response.status).toBe(200);
    const proposal = await response.json();
    expect(proposal.tasks[0]).toMatchObject({
      start: "2027-01-04T22:00:00.000Z",
      end: "2027-01-05T00:00:00.000Z",
    });
    expect((await ctx.apply(proposal)).status).toBe(200);
    await db
      .update(schema.taskTable)
      .set({ status: "done", columnId: ctx.columns.done.id })
      .where(eq(schema.taskTable.id, task.id));
    expect((await ctx.apply(await ctx.preview())).status).toBe(200);
    const execution = await readMilestoneExecution(db, ctx.project.id, [
      milestone!.id,
    ]);
    expect(execution.get(milestone!.id)).toMatchObject({
      status: "done",
      startDate: "2027-01-04",
      endDate: "2027-01-04",
    });
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, task.id),
        })
      )?.dueDate,
    ).toEqual(new Date("2027-01-05T00:00:00Z"));
  });

  it("does not revive archived legacy timing after the first Apply and reopening", async () => {
    const ctx = await setup();
    await ctx.configure();
    const old = new Date("2026-10-01T09:00:00Z");
    const task = await ctx.leaf({
      status: "archived",
      estimateSeconds: null,
      startDate: old,
      dueDate: old,
      legacyStartDate: old,
      legacyDueDate: old,
    });
    expect((await ctx.apply(await ctx.preview())).status).toBe(200);
    await db
      .update(schema.taskTable)
      .set({ status: "to-do", columnId: ctx.columns.todo.id })
      .where(eq(schema.taskTable.id, task.id));
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      }),
    ).toMatchObject({
      startDate: null,
      dueDate: null,
      legacyStartDate: old,
      legacyDueDate: old,
    });
    expect((await ctx.preview()).diagnostics).toContainEqual({
      taskId: task.id,
      reason: "no_estimate",
    });
  });

  it("previews without writing, then atomically publishes Task/Bug segments and a durable generation", async () => {
    const ctx = await setup();
    await ctx.configure();
    const first = await ctx.leaf({ priority: "urgent" });
    const second = await ctx.leaf({ type: "bug", estimateSeconds: 3600 });
    const proposal = await ctx.preview();
    expect(proposal.scheduledCount).toBe(2);
    expect(
      proposal.tasks.find(
        (task: { taskId: string }) => task.taskId === first.id,
      ),
    ).toMatchObject({
      start: "2027-01-04T09:00:00.000Z",
      end: "2027-01-04T11:00:00.000Z",
    });
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, first.id),
        })
      )?.startDate,
    ).toBeNull();
    const applied = await ctx.apply(proposal);
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({
      generation: 1,
      legacy: false,
      outdated: false,
    });
    const saved = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, second.id),
    });
    expect(saved?.scheduleSegments).toEqual([
      { start: "2027-01-04T11:00:00.000Z", end: "2027-01-04T12:00:00.000Z" },
    ]);
    expect((await db.select().from(schema.projectPlanTable)).length).toBe(1);
    expect(
      (await db.select().from(schema.releaseProgressEventTable)).length,
    ).toBe(0);
  });
  it("rejects stale previews without partial writes, and preserves the last applied plan after input edits", async () => {
    const ctx = await setup();
    await ctx.configure();
    const task = await ctx.leaf();
    const proposal = await ctx.preview();
    await db
      .update(schema.taskTable)
      .set({ estimateSeconds: 14400 })
      .where(eq(schema.taskTable.id, task.id));
    expect((await ctx.apply(proposal)).status).toBe(409);
    expect(
      (
        await db.query.projectTable.findFirst({
          where: eq(schema.projectTable.id, ctx.project.id),
        })
      )?.scheduleGeneration,
    ).toBe(0);
    expect((await ctx.apply(await ctx.preview())).status).toBe(200);
    await db
      .update(schema.taskTable)
      .set({ priority: "urgent" })
      .where(eq(schema.taskTable.id, task.id));
    const response = await ctx.call("GET", ctx.base);
    expect(await response.json()).toMatchObject({
      outdated: true,
      tasks: [
        {
          taskId: task.id,
          start: "2027-01-04T09:00:00.000Z",
          end: "2027-01-04T13:00:00.000Z",
        },
      ],
    });
  });
  it("allows only one concurrent Apply of a generation", async () => {
    const ctx = await setup();
    await ctx.configure();
    await ctx.leaf();
    const proposal = await ctx.preview();
    const responses = await Promise.all([
      ctx.apply(proposal),
      ctx.apply(proposal),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect((await db.select().from(schema.projectPlanTable)).length).toBe(1);
  });
  it("subtracts time logs across contributors and blocks exhausted dependencies", async () => {
    const ctx = await setup();
    await ctx.configure();
    const task = await ctx.leaf({ estimateSeconds: 14400 });
    await db.insert(schema.timeEntryTable).values({
      taskId: task.id,
      userId: ctx.user.id,
      startTime: new Date("2026-10-01T09:00:00Z"),
      endTime: new Date("2026-10-01T12:00:00Z"),
      duration: 10800,
    });
    expect((await ctx.preview()).tasks[0]).toMatchObject({
      start: "2027-01-04T09:00:00.000Z",
      end: "2027-01-04T10:00:00.000Z",
    });
    await db
      .update(schema.taskTable)
      .set({ estimateSeconds: 10800 })
      .where(eq(schema.taskTable.id, task.id));
    const next = await ctx.leaf();
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: task.id,
      targetTaskId: next.id,
      relationType: "blocks",
    });
    const proposal = await ctx.preview();
    expect(
      proposal.tasks.find((item: { taskId: string }) => item.taskId === task.id)
        .reason,
    ).toBe("estimate_exhausted");
    expect(
      proposal.tasks.find((item: { taskId: string }) => item.taskId === next.id)
        .reason,
    ).toBe("blocked_dependency");
  });
  it("clears unscheduled unfinished legacy placements only on Apply, preserving legacy and completed dates", async () => {
    const ctx = await setup();
    await ctx.configure();
    const old = new Date("2026-10-01T09:00:00Z");
    const task = await ctx.leaf({
      estimateSeconds: null,
      startDate: old,
      dueDate: old,
      legacyStartDate: old,
      legacyDueDate: old,
    });
    const done = await ctx.leaf({
      status: "done",
      startDate: old,
      dueDate: old,
    });
    expect((await (await ctx.call("GET", ctx.base)).json()).legacy).toBe(true);
    const proposal = await ctx.preview();
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, task.id),
        })
      )?.dueDate,
    ).toEqual(old);
    expect((await ctx.apply(proposal)).status).toBe(200);
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      }),
    ).toMatchObject({ startDate: null, dueDate: null, legacyDueDate: old });
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, done.id),
        })
      )?.dueDate,
    ).toEqual(old);
  });
  it("validates calendars, configured timezones, permissions, and workspace isolation", async () => {
    const ctx = await setup();
    expect((await ctx.call("POST", `${ctx.base}/preview`, {})).status).toBe(
      400,
    );
    expect(
      (
        await ctx.call("PUT", `${ctx.base}/settings`, {
          timeZone: "Invalid/Zone",
          estimateDayMinutes: 480,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx.call(
          "PUT",
          `/work-calendar/${ctx.workspace.id}/${ctx.user.id}`,
          {
            ...ctx.calendar,
            weeklyIntervals: [{ weekday: 1, startMinute: 600, endMinute: 540 }],
          },
        )
      ).status,
    ).toBe(400);
    const foreign = await createWorkspaceMember({ role: "owner" });
    expect(
      (
        await ctx.call(
          "PUT",
          `/work-calendar/${ctx.workspace.id}/${foreign.user.id}`,
          ctx.calendar,
        )
      ).status,
    ).toBe(404);
    mockAuthenticatedSession(foreign.user);
    expect((await ctx.call("GET", ctx.base)).status).toBeGreaterThanOrEqual(
      403,
    );
    mockAuthenticatedSession(ctx.user);
    await db
      .update(schema.workspaceUserTable)
      .set({ role: "member" })
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, ctx.workspace.id),
          eq(schema.workspaceUserTable.userId, ctx.user.id),
        ),
      );
    expect((await ctx.call("GET", ctx.base)).status).toBe(200);
    expect((await ctx.call("POST", `${ctx.base}/preview`, {})).status).toBe(
      403,
    );
    expect(
      (
        await ctx.call(
          "PUT",
          `/work-calendar/${ctx.workspace.id}/${ctx.user.id}`,
          ctx.calendar,
        )
      ).status,
    ).toBe(200);
  });
  it("requires both project-update and task-update API-key scopes", async () => {
    const ctx = await setup();
    await ctx.configure();
    const key = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Planning read",
        permissions: { task: ["read", "update"] },
      },
    });
    const response = await ctx.app.request(`/api${ctx.base}/preview`, {
      ...jsonRequest("POST", {}),
      headers: { "content-type": "application/json", "x-api-key": key.key },
    });
    expect(response.status).toBe(403);
  });
});
