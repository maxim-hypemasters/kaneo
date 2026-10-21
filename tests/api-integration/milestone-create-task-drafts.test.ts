import { and, eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { createMilestone } from "../../apps/api/src/milestone/write-milestones";
import createTask from "../../apps/api/src/task/controllers/create-task";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(resetTestDatabase);
async function setup(role = "owner") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const feature = await insertTask(fixture.project.id, { type: "feature" });
  const existing = await insertTask(fixture.project.id, {
    featureId: feature.id,
  });
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: existing.number! })
    .where(eq(schema.projectTable.id, fixture.project.id));
  const release = await insertRelease(fixture.project.id);
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const create = (fields: Record<string, unknown> = {}) =>
    app.request(
      `/api/milestone/feature/${feature.id}`,
      jsonRequest("POST", { title: "Draft milestone", ...fields }),
    );
  return { ...member, ...fixture, feature, existing, release, app, create };
}
const tasksIn = (milestoneId: string) =>
  db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.milestoneId, milestoneId))
    .orderBy(schema.taskTable.number);
const counter = async (projectId: string) =>
  (await db.query.projectTable.findFirst({
    where: eq(schema.projectTable.id, projectId),
  }))!.lastTaskNumber;
const history = () =>
  db
    .select()
    .from(schema.releaseProgressEventTable)
    .orderBy(schema.releaseProgressEventTable.id);

async function expectNothingCreated(
  ctx: Awaited<ReturnType<typeof setup>>,
  lastNumber = ctx.existing.number,
) {
  expect(await db.select().from(schema.milestoneTable)).toEqual([]);
  expect(await db.select().from(schema.activityTable)).toEqual([]);
  expect(await db.select().from(schema.taskTable)).toHaveLength(2);
  expect(await counter(ctx.project.id)).toBe(lastNumber);
  expect(
    (
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, ctx.existing.id),
      })
    )?.milestoneId,
  ).toBeNull();
}

describe("atomic milestone Task/Bug drafts", () => {
  it("combines existing and new work, applies normal defaults, and publishes only committed records", async () => {
    const ctx = await setup();
    const override = await insertRelease(ctx.project.id);
    await db
      .update(schema.taskTable)
      .set({ releaseId: override.id })
      .where(eq(schema.taskTable.id, ctx.existing.id));
    const publish = vi
      .spyOn(events, "publishEvent")
      .mockImplementation(async (name, data) => {
        if (name === "task.created") {
          const payload = data as { taskId: string; milestoneId: string };
          expect(await tasksIn(payload.milestoneId)).toHaveLength(3);
          expect(
            await db.query.taskTable.findFirst({
              where: eq(schema.taskTable.id, payload.taskId),
            }),
          ).toBeDefined();
        }
      });
    const response = await ctx.create({
      leadId: ctx.user.id,
      priority: "urgent",
      releaseId: ctx.release.id,
      taskIds: [ctx.existing.id],
      newTasks: [
        { title: "  First task  " },
        { title: "New bug", type: "bug" },
      ],
    });
    expect(response.status).toBe(200);
    const milestone = await response.json();
    expect(milestone.progress).toEqual({ total: 3, started: 0, completed: 0 });
    expect(milestone).toMatchObject({
      status: "to-do",
      startDate: null,
      endDate: null,
    });
    const work = await tasksIn(milestone.id);
    expect(work[0]).toMatchObject({
      id: ctx.existing.id,
      releaseId: override.id,
    });
    for (const [index, task] of work.slice(1).entries()) {
      expect(task).toMatchObject({
        title: index === 0 ? "First task" : "New bug",
        type: index === 0 ? "task" : "bug",
        featureId: ctx.feature.id,
        milestoneId: milestone.id,
        projectId: ctx.project.id,
        releaseId: ctx.release.id,
        userId: null,
        priority: "no-priority",
        status: "to-do",
        columnId: ctx.columns.todo.id,
        startDate: null,
        dueDate: null,
        description: "",
        number: ctx.existing.number! + index + 1,
      });
    }
    expect(new Set(work.slice(1).map((task) => task.position)).size).toBe(2);
    expect(await counter(ctx.project.id)).toBe(ctx.existing.number! + 2);
    const createdEvents = publish.mock.calls.filter(
      ([name]) => name === "task.created",
    );
    expect(createdEvents).toHaveLength(2);
    expect(createdEvents[0]?.[1]).toMatchObject({
      currentUserId: ctx.user.id,
      type: "created",
      content: null,
    });
    expect(
      publish.mock.calls.some(([name]) => name === "milestone.changed"),
    ).toBe(true);
    expect(
      publish.mock.calls
        .filter(([name]) => name === "task.updated")
        .map(([, data]) => (data as { taskId: string }).taskId)
        .sort(),
    ).toEqual([ctx.existing.id, ctx.feature.id].sort());
    const progress = await (
      await ctx.app.request(`/api/release/${ctx.release.id}/progress`)
    ).json();
    expect(progress.current).toMatchObject({
      scope: 2,
      started: 0,
      completed: 0,
    });
  });

  it("records normal task creation activity after a successful save", async () => {
    const ctx = await setup();
    const response = await ctx.create({
      newTasks: [{ title: "Recorded work", type: "bug" }],
    });
    expect(response.status).toBe(200);
    const milestone = await response.json();
    const [task] = await tasksIn(milestone.id);
    await expect
      .poll(async () =>
        db
          .select()
          .from(schema.activityTable)
          .where(
            and(
              eq(schema.activityTable.taskId, task!.id),
              eq(schema.activityTable.type, "created"),
            ),
          ),
      )
      .toMatchObject([{ userId: ctx.user.id }]);
  });

  it("fills and validates normal required custom-field defaults", async () => {
    const ctx = await setup();
    const [field] = await db
      .insert(schema.customFieldDefinitionTable)
      .values({
        projectId: ctx.project.id,
        name: "Effort",
        type: "number",
        required: true,
        defaultValue: "5",
      })
      .returning();
    const response = await ctx.create({
      newTasks: [
        { title: "Defaulted" },
        { title: "Defaulted bug", type: "bug" },
      ],
    });
    expect(response.status).toBe(200);
    const milestone = await response.json();
    const tasks = await tasksIn(milestone.id);
    expect(
      await db
        .select()
        .from(schema.customFieldValueTable)
        .where(
          inArray(
            schema.customFieldValueTable.taskId,
            tasks.map((task) => task.id),
          ),
        ),
    ).toMatchObject([
      { fieldId: field!.id, value: "5" },
      { fieldId: field!.id, value: "5" },
    ]);
  });

  it.each([null, "not a number"])(
    "rolls back selected links and metadata when required custom fields cannot use default %j",
    async (defaultValue) => {
      const ctx = await setup();
      await db.insert(schema.customFieldDefinitionTable).values({
        projectId: ctx.project.id,
        name: "Effort",
        type: "number",
        required: true,
        defaultValue,
      });
      const before = await history();
      const publish = vi
        .spyOn(events, "publishEvent")
        .mockResolvedValue(undefined);
      const response = await ctx.create({
        taskIds: [ctx.existing.id],
        releaseId: ctx.release.id,
        newTasks: [{ title: "Blocked" }],
      });
      expect(response.status).toBe(400);
      expect((await response.json()).message).toContain("Effort");
      await expectNothingCreated(ctx);
      expect(await history()).toEqual(before);
      expect(publish).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ title: " " }],
    [{ title: "Invalid", type: "feature" }],
    [{ title: "Invalid", priority: "urgent" }],
    Array.from({ length: 101 }, () => ({ title: "Too many" })),
  ])("rejects malformed drafts without changing data", async (newTasks) => {
    const ctx = await setup();
    expect((await ctx.create({ newTasks })).status).toBe(400);
    await expectNothingCreated(ctx);
  });

  it("rolls back numbers, earlier drafts, existing links, activity and release history on a late insert failure", async () => {
    const ctx = await setup();
    const before = await history();
    const publish = vi
      .spyOn(events, "publishEvent")
      .mockResolvedValue(undefined);
    await db.execute(
      sql`create function fail_milestone_draft() returns trigger language plpgsql as $$ begin if new.title = 'Fail draft' then raise exception 'forced draft insertion failure'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger fail_milestone_draft before insert on task for each row execute function fail_milestone_draft()`,
    );
    try {
      expect(
        (
          await ctx.create({
            taskIds: [ctx.existing.id],
            releaseId: ctx.release.id,
            newTasks: [
              { title: "Earlier draft" },
              { title: "Fail draft", type: "bug" },
            ],
          })
        ).status,
      ).toBe(500);
      await expectNothingCreated(ctx);
      expect(await history()).toEqual(before);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      await db.execute(sql`drop function fail_milestone_draft() cascade`);
    }
    const next = await createTask({
      projectId: ctx.project.id,
      currentUserId: ctx.user.id,
      title: "Next normal task",
      status: "to-do",
    });
    expect(next.number).toBe(ctx.existing.number! + 1);
  });

  it("chooses the first unambiguous nonfinal column by position then id", async () => {
    const ctx = await setup();
    await db
      .update(schema.columnTable)
      .set({ position: -10 })
      .where(eq(schema.columnTable.id, ctx.columns.inProgress.id));
    await db.insert(schema.columnTable).values({
      projectId: ctx.project.id,
      name: "Duplicate",
      slug: "in-progress",
      position: -9,
    });
    await db
      .update(schema.columnTable)
      .set({ position: -20 })
      .where(eq(schema.columnTable.id, ctx.columns.done.id));
    const response = await ctx.create({
      newTasks: [{ title: "Ordered default" }],
    });
    expect(response.status).toBe(200);
    expect((await tasksIn((await response.json()).id))[0]).toMatchObject({
      status: "to-do",
      columnId: ctx.columns.todo.id,
    });
  });

  it("falls back to Planned when no unambiguous nonfinal column exists", async () => {
    const ctx = await setup();
    await db
      .update(schema.columnTable)
      .set({ isFinal: true })
      .where(eq(schema.columnTable.projectId, ctx.project.id));
    const response = await ctx.create({
      newTasks: [{ title: "Unscheduled bug", type: "bug" }],
    });
    expect(response.status).toBe(200);
    expect((await tasksIn((await response.json()).id))[0]).toMatchObject({
      status: "planned",
      columnId: null,
      releaseId: null,
    });
  });

  it("keeps concurrent milestone drafts and ordinary creation numbered and positioned without conflicts", async () => {
    const ctx = await setup();
    vi.spyOn(events, "publishEvent").mockResolvedValue(undefined);
    const [first, second, ordinary] = await Promise.all([
      ctx.create({
        newTasks: [{ title: "First A" }, { title: "First B", type: "bug" }],
      }),
      ctx.create({ newTasks: [{ title: "Second A" }, { title: "Second B" }] }),
      createTask({
        projectId: ctx.project.id,
        featureId: ctx.feature.id,
        currentUserId: ctx.user.id,
        title: "Ordinary",
        status: "to-do",
        expectedWorkspaceId: ctx.workspace.id,
      }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const work = [
      ...(await tasksIn((await first.json()).id)),
      ...(await tasksIn((await second.json()).id)),
      ordinary,
    ];
    expect(new Set(work.map((task) => task.number)).size).toBe(5);
    expect(new Set(work.map((task) => task.position)).size).toBe(5);
    expect(await counter(ctx.project.id)).toBe(ctx.existing.number! + 5);
  });

  it("does not require task:create for existing-only milestones but rejects nonempty drafts without it", async () => {
    const ctx = await setup("planner");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "planner",
      permission: JSON.stringify({ task: ["read", "update"] }),
    });
    expect(
      (await ctx.create({ newTasks: [{ title: "Unauthorized" }] })).status,
    ).toBe(403);
    await expectNothingCreated(ctx);
    expect(
      (await ctx.create({ taskIds: [ctx.existing.id], newTasks: [] })).status,
    ).toBe(200);
  });

  it("requires task:update even when task:create is allowed", async () => {
    const ctx = await setup("creator");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "creator",
      permission: JSON.stringify({ task: ["read", "create"] }),
    });
    expect(
      (await ctx.create({ newTasks: [{ title: "Unauthorized" }] })).status,
    ).toBe(403);
    await expectNothingCreated(ctx);
  });

  it("enforces API-key task:create scopes only for nonempty drafts", async () => {
    const ctx = await setup();
    vi.restoreAllMocks();
    const manage = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Manage",
        permissions: { task: ["read", "update"] },
      },
    });
    const create = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Create",
        permissions: { task: ["read", "update", "create"] },
      },
    });
    const request = (key: string, newTasks: unknown[]) => {
      const body = jsonRequest("POST", { title: "Scoped", newTasks });
      return ctx.app.request(`/api/milestone/feature/${ctx.feature.id}`, {
        ...body,
        headers: { ...body.headers, "x-api-key": key },
      });
    };
    expect((await request(manage.key, [{ title: "Denied" }])).status).toBe(403);
    await expectNothingCreated(ctx);
    expect((await request(manage.key, [])).status).toBe(200);
    expect(
      (await request(create.key, [{ title: "Allowed bug", type: "bug" }]))
        .status,
    ).toBe(200);
  });

  it("retains lead-assignment and project/workspace boundaries for draft creation", async () => {
    const ctx = await setup("planner");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "planner",
      permission: JSON.stringify({ task: ["read", "update", "create"] }),
    });
    expect(
      (
        await ctx.create({
          leadId: ctx.user.id,
          newTasks: [{ title: "No assign permission" }],
        })
      ).status,
    ).toBe(403);
    await expectNothingCreated(ctx);
    const foreign = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const foreignRelease = await insertRelease(foreign.project.id);
    expect(
      (
        await ctx.create({
          releaseId: foreignRelease.id,
          newTasks: [{ title: "Wrong project" }],
        })
      ).status,
    ).toBe(404);
    await expectNothingCreated(ctx);
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect(
      (await ctx.create({ newTasks: [{ title: "Wrong workspace" }] })).status,
    ).toBe(404);
    await expectNothingCreated(ctx);
  });

  it("rejects stale authorized project/workspace context before allocating numbers", async () => {
    const ctx = await setup();
    const other = await createWorkspaceMember();
    await db
      .update(schema.projectTable)
      .set({ workspaceId: other.workspace.id })
      .where(eq(schema.projectTable.id, ctx.project.id));
    await expect(
      createMilestone(
        ctx.feature.id,
        { title: "Stale", newTasks: [{ title: "Draft", type: "task" }] },
        ctx.user.id,
        ctx.project.id,
        ctx.workspace.id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expectNothingCreated(ctx);
  });
});
