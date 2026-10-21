import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
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
  const existing = await insertTask(fixture.project.id);
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: existing.number! })
    .where(eq(schema.projectTable.id, fixture.project.id));
  const release = await insertRelease(fixture.project.id);
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const create = (
    featureComposition: unknown,
    overrides: Record<string, unknown> = {},
  ) =>
    app.request(
      `/api/task/${fixture.project.id}`,
      jsonRequest("POST", {
        title: "Knowledge Feature",
        description: "Knowledge",
        type: "feature",
        featureComposition,
        ...overrides,
      }),
    );
  return { ...member, ...fixture, existing, release, app, create };
}
const snapshot = async () => ({
  tasks: await db.select().from(schema.taskTable).orderBy(schema.taskTable.id),
  milestones: await db
    .select()
    .from(schema.milestoneTable)
    .orderBy(schema.milestoneTable.id),
  activity: await db
    .select()
    .from(schema.activityTable)
    .orderBy(schema.activityTable.id),
  history: await db
    .select()
    .from(schema.releaseProgressEventTable)
    .orderBy(schema.releaseProgressEventTable.id),
  counters: await db
    .select({
      id: schema.projectTable.id,
      number: schema.projectTable.lastTaskNumber,
    })
    .from(schema.projectTable)
    .orderBy(schema.projectTable.id),
});

describe("atomic Feature composition", () => {
  it("creates ordered milestones, links existing work, creates Tasks/Bugs and emits only committed records", async () => {
    const ctx = await setup();
    const override = await insertRelease(ctx.project.id);
    await db
      .update(schema.taskTable)
      .set({ releaseId: override.id })
      .where(eq(schema.taskTable.id, ctx.existing.id));
    const done = await insertTask(ctx.project.id, {
      type: "bug",
      status: "done",
      columnId: ctx.columns.done.id,
    });
    await db
      .update(schema.projectTable)
      .set({ lastTaskNumber: done.number! })
      .where(eq(schema.projectTable.id, ctx.project.id));
    const publish = vi
      .spyOn(events, "publishEvent")
      .mockImplementation(async () => {
        expect(
          await db
            .select()
            .from(schema.taskTable)
            .where(eq(schema.taskTable.projectId, ctx.project.id)),
        ).toHaveLength(6);
        expect(await db.select().from(schema.milestoneTable)).toHaveLength(3);
      });
    const response = await ctx.create({
      milestones: [
        {
          key: "a",
          title: " Phase ",
          leadId: ctx.user.id,
          priority: "urgent",
          releaseId: ctx.release.id,
        },
        { key: "b", title: "Phase", releaseId: null },
        { key: "empty", title: "Empty" },
      ],
      existingTasks: [
        { id: ctx.existing.id, milestoneKey: "a" },
        { id: done.id, milestoneKey: "b" },
      ],
      newTasks: [
        { title: " New Task ", milestoneKey: "a" },
        { title: "New Bug", type: "bug", milestoneKey: "b" },
        { title: "Direct Task" },
      ],
      unassignedReleaseId: override.id,
    });
    expect(response.status).toBe(200);
    const feature = await response.json();
    expect(feature).toMatchObject({
      type: "feature",
      title: "Knowledge Feature",
      status: null,
      priority: null,
      userId: null,
      startDate: null,
      dueDate: null,
      releaseId: null,
      featureId: null,
      milestoneId: null,
      number: done.number! + 1,
    });
    expect(feature).not.toHaveProperty("featureComposition");
    const milestones = await db
      .select()
      .from(schema.milestoneTable)
      .where(eq(schema.milestoneTable.featureId, feature.id))
      .orderBy(schema.milestoneTable.position);
    expect(
      milestones.map(({ title, position }) => ({ title, position })),
    ).toEqual([
      { title: "Phase", position: 0 },
      { title: "Phase", position: 1 },
      { title: "Empty", position: 2 },
    ]);
    const children = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.featureId, feature.id))
      .orderBy(schema.taskTable.number);
    expect(children).toHaveLength(5);
    expect(children.find((task) => task.id === ctx.existing.id)).toMatchObject({
      milestoneId: milestones[0]!.id,
      releaseId: override.id,
    });
    expect(children.find((task) => task.id === done.id)).toMatchObject({
      milestoneId: milestones[1]!.id,
      releaseId: null,
      type: "bug",
      status: "done",
    });
    const newWork = children.filter(
      (task) => ![ctx.existing.id, done.id].includes(task.id),
    );
    expect(
      newWork.map(({ title, type, releaseId, milestoneId }) => ({
        title,
        type,
        releaseId,
        milestoneId,
      })),
    ).toEqual([
      {
        title: "New Task",
        type: "task",
        releaseId: ctx.release.id,
        milestoneId: milestones[0]!.id,
      },
      {
        title: "New Bug",
        type: "bug",
        releaseId: null,
        milestoneId: milestones[1]!.id,
      },
      {
        title: "Direct Task",
        type: "task",
        releaseId: override.id,
        milestoneId: null,
      },
    ]);
    for (const task of newWork)
      expect(task).toMatchObject({
        userId: null,
        priority: "no-priority",
        status: "to-do",
        columnId: ctx.columns.todo.id,
        startDate: null,
        dueDate: null,
        description: "",
      });
    expect(new Set(newWork.map((task) => task.position)).size).toBe(3);
    expect(
      publish.mock.calls.filter(([name]) => name === "task.created"),
    ).toHaveLength(4);
    expect(
      publish.mock.calls.filter(([name]) => name === "milestone.changed"),
    ).toHaveLength(3);
    const activity = await db.select().from(schema.activityTable);
    expect(
      activity.filter((row) => row.type === "milestone_created"),
    ).toHaveLength(3);
    expect(
      activity.filter((row) => row.type === "feature_changed"),
    ).toHaveLength(2);
    expect(
      activity.filter((row) => row.type === "milestone_changed"),
    ).toHaveLength(2);
    const metadata = await ctx.app.request(
      `/api/milestone/feature/${feature.id}`,
    );
    const summaries = await metadata.json();
    expect(summaries.map((row: { progress: unknown }) => row.progress)).toEqual(
      [
        { total: 2, started: 0, completed: 0 },
        { total: 2, started: 1, completed: 1 },
        { total: 0, started: 0, completed: 0 },
      ],
    );
    const releases = await ctx.app.request(
      `/api/release/project/${ctx.project.id}`,
    );
    expect(releases.status).toBe(200);
  });

  it("preserves existing release choices and inherits only a selected milestone's release", async () => {
    const ctx = await setup();
    const direct = await insertTask(ctx.project.id, { type: "bug" });
    await db
      .update(schema.projectTable)
      .set({ lastTaskNumber: direct.number! })
      .where(eq(schema.projectTable.id, ctx.project.id));
    const response = await ctx.create({
      milestones: [{ key: "m", title: "Planned", releaseId: ctx.release.id }],
      existingTasks: [
        { id: ctx.existing.id, milestoneKey: "m" },
        { id: direct.id },
      ],
      unassignedReleaseId: ctx.release.id,
    });
    expect(response.status).toBe(200);
    const [linked] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, ctx.existing.id));
    const [unassigned] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, direct.id));
    expect(linked).toMatchObject({ releaseId: ctx.release.id });
    expect(unassigned).toMatchObject({ releaseId: null, milestoneId: null });
  });

  it.each([null, "not a number"])(
    "rolls back hierarchy when child required fields cannot use default %j",
    async (defaultValue) => {
      const ctx = await setup();
      const [field] = await db
        .insert(schema.customFieldDefinitionTable)
        .values({
          projectId: ctx.project.id,
          name: "Effort",
          type: "number",
          required: true,
          defaultValue,
        })
        .returning();
      const before = await snapshot();
      const publish = vi
        .spyOn(events, "publishEvent")
        .mockResolvedValue(undefined);
      const response = await ctx.create(
        {
          milestones: [
            { key: "m", title: "Must roll back", releaseId: ctx.release.id },
          ],
          existingTasks: [{ id: ctx.existing.id, milestoneKey: "m" }],
          newTasks: [{ title: "Rejected child", milestoneKey: "m" }],
        },
        { customFields: [{ fieldId: field!.id, value: "10" }] },
      );
      expect(response.status).toBe(400);
      expect((await response.json()).message).toContain("Effort");
      expect(await snapshot()).toEqual(before);
      expect(publish).not.toHaveBeenCalled();
    },
  );

  it("uses required custom-field defaults for every new item", async () => {
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
      newTasks: [{ title: "Task" }, { title: "Bug", type: "bug" }],
    });
    expect(response.status).toBe(200);
    expect(
      await db
        .select()
        .from(schema.customFieldValueTable)
        .where(eq(schema.customFieldValueTable.fieldId, field!.id)),
    ).toHaveLength(3);
  });

  it("rolls back a late insertion failure, including staged assets, activity, numbers and release history", async () => {
    const ctx = await setup();
    const [asset] = await db
      .insert(schema.assetTable)
      .values({
        workspaceId: ctx.workspace.id,
        projectId: ctx.project.id,
        createdBy: ctx.user.id,
        objectKey: "feature-draft",
        filename: "diagram.png",
        mimeType: "image/png",
        size: 10,
        surface: "draft",
      })
      .returning();
    const before = await snapshot();
    const publish = vi
      .spyOn(events, "publishEvent")
      .mockResolvedValue(undefined);
    await db.execute(
      sql`create function fail_feature_draft() returns trigger language plpgsql as $$ begin if new.title = 'Fail child' then raise exception 'forced child failure'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger fail_feature_draft before insert on task for each row execute function fail_feature_draft()`,
    );
    try {
      const response = await ctx.create(
        {
          milestones: [
            { key: "m", title: "Rollback", releaseId: ctx.release.id },
          ],
          existingTasks: [{ id: ctx.existing.id, milestoneKey: "m" }],
          newTasks: [{ title: "Earlier child" }, { title: "Fail child" }],
        },
        {
          description: `![diagram](/api/asset/${asset!.id})`,
          draftAssetIds: [asset!.id],
        },
      );
      expect(response.status).toBe(500);
      expect(await snapshot()).toEqual(before);
      expect(
        await db.query.assetTable.findFirst({
          where: eq(schema.assetTable.id, asset!.id),
        }),
      ).toMatchObject({ taskId: null, surface: "draft" });
      expect(publish).not.toHaveBeenCalled();
    } finally {
      await db.execute(sql`drop function fail_feature_draft() cascade`);
    }
    const next = await createTask({
      projectId: ctx.project.id,
      currentUserId: ctx.user.id,
      title: "Next",
      status: "to-do",
    });
    expect(next.number).toBe(ctx.existing.number! + 1);
  });

  it.each(["owned", "archived", "deleted", "foreign", "feature"])(
    "rejects a stale or ineligible %s selection without creating the Feature",
    async (kind) => {
      const ctx = await setup();
      let id = ctx.existing.id;
      if (kind === "owned") {
        const owner = await insertTask(ctx.project.id, { type: "feature" });
        await db
          .update(schema.taskTable)
          .set({ featureId: owner.id })
          .where(eq(schema.taskTable.id, id));
        await db
          .update(schema.projectTable)
          .set({ lastTaskNumber: owner.number! })
          .where(eq(schema.projectTable.id, ctx.project.id));
      } else if (kind === "archived")
        await db
          .update(schema.taskTable)
          .set({ status: "archived" })
          .where(eq(schema.taskTable.id, id));
      else if (kind === "deleted")
        await db.delete(schema.taskTable).where(eq(schema.taskTable.id, id));
      else if (kind === "foreign") {
        const foreign = await createProjectFixture({
          workspaceId: ctx.workspace.id,
        });
        id = (await insertTask(foreign.project.id)).id;
      } else {
        const feature = await insertTask(ctx.project.id, { type: "feature" });
        id = feature.id;
        await db
          .update(schema.projectTable)
          .set({ lastTaskNumber: feature.number! })
          .where(eq(schema.projectTable.id, ctx.project.id));
      }
      const before = await snapshot();
      expect((await ctx.create({ existingTasks: [{ id }] })).status).toBe(409);
      expect(await snapshot()).toEqual(before);
    },
  );

  it("serializes competing assignments so only one Feature is created", async () => {
    const ctx = await setup();
    vi.spyOn(events, "publishEvent").mockResolvedValue(undefined);
    const responses = await Promise.all([
      ctx.create({ existingTasks: [{ id: ctx.existing.id }] }),
      ctx.create({ existingTasks: [{ id: ctx.existing.id }] }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.type, "feature")),
    ).toHaveLength(1);
    expect(
      (
        await db.query.projectTable.findFirst({
          where: eq(schema.projectTable.id, ctx.project.id),
        })
      )?.lastTaskNumber,
    ).toBe(ctx.existing.number! + 1);
  });

  it("keeps concurrent compositions and ordinary work numbered and positioned uniquely", async () => {
    const ctx = await setup();
    vi.spyOn(events, "publishEvent").mockResolvedValue(undefined);
    const responses = await Promise.all([
      ctx.create({
        newTasks: [{ title: "First A" }, { title: "First B", type: "bug" }],
      }),
      ctx.create({ newTasks: [{ title: "Second A" }, { title: "Second B" }] }),
      createTask({
        projectId: ctx.project.id,
        currentUserId: ctx.user.id,
        title: "Ordinary",
        status: "to-do",
      }),
    ]);
    expect((responses[0] as Response).status).toBe(200);
    expect((responses[1] as Response).status).toBe(200);
    const all = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, ctx.project.id));
    expect(new Set(all.map((task) => task.number)).size).toBe(8);
    const newLeaves = all.filter(
      (task) => task.type !== "feature" && task.id !== ctx.existing.id,
    );
    expect(new Set(newLeaves.map((task) => task.position)).size).toBe(5);
  });

  it("uses workflow order with ambiguous slug and Planned fallback rules for direct child drafts", async () => {
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
    const response = await ctx.create({ newTasks: [{ title: "Ordered" }] });
    expect(response.status).toBe(200);
    const feature = await response.json();
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.featureId, feature.id),
      }),
    ).toMatchObject({ status: "to-do", columnId: ctx.columns.todo.id });
    await db
      .update(schema.columnTable)
      .set({ isFinal: true })
      .where(eq(schema.columnTable.projectId, ctx.project.id));
    const planned = await ctx.create({ newTasks: [{ title: "Planned" }] });
    expect(planned.status).toBe(200);
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.featureId, (await planned.json()).id),
      }),
    ).toMatchObject({ status: "planned", columnId: null });
  });

  it("allows create-only Features and draft work but requires update for milestones and existing links", async () => {
    const ctx = await setup("creator");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "creator",
      permission: JSON.stringify({ task: ["read", "create"] }),
    });
    const before = await snapshot();
    expect(
      (await ctx.create({ milestones: [{ key: "m", title: "Denied" }] }))
        .status,
    ).toBe(403);
    expect(
      (await ctx.create({ existingTasks: [{ id: ctx.existing.id }] })).status,
    ).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect(
      (await ctx.create({ newTasks: [{ title: "Allowed" }] })).status,
    ).toBe(200);
  });

  it("enforces API-key create/update/assign scopes without changing existing caller requirements", async () => {
    const ctx = await setup();
    vi.restoreAllMocks();
    const keys = await Promise.all([
      auth.api.createApiKey({
        body: {
          userId: ctx.user.id,
          name: "Create",
          permissions: { task: ["create"] },
        },
      }),
      auth.api.createApiKey({
        body: {
          userId: ctx.user.id,
          name: "Plan",
          permissions: { task: ["create", "update"] },
        },
      }),
      auth.api.createApiKey({
        body: {
          userId: ctx.user.id,
          name: "Assign",
          permissions: { task: ["create", "update", "assign"] },
        },
      }),
    ]);
    const request = (key: string, featureComposition: unknown) => {
      const body = jsonRequest("POST", {
        title: "Scoped",
        description: "",
        type: "feature",
        featureComposition,
      });
      return ctx.app.request(`/api/task/${ctx.project.id}`, {
        ...body,
        headers: { ...body.headers, "x-api-key": key },
      });
    };
    expect(
      (
        await request(keys[0]!.key, {
          milestones: [{ key: "m", title: "Denied" }],
        })
      ).status,
    ).toBe(403);
    expect(
      (await request(keys[0]!.key, { newTasks: [{ title: "Allowed" }] }))
        .status,
    ).toBe(200);
    const planned = {
      milestones: [{ key: "m", title: "Lead", leadId: ctx.user.id }],
    };
    expect((await request(keys[1]!.key, planned)).status).toBe(403);
    expect((await request(keys[2]!.key, planned)).status).toBe(200);
  });

  it("rejects foreign project planning references and inaccessible workspaces", async () => {
    const ctx = await setup();
    const other = await createProjectFixture({ workspaceId: ctx.workspace.id });
    const release = await insertRelease(other.project.id);
    const before = await snapshot();
    expect(
      (
        await ctx.create({
          milestones: [
            { key: "m", title: "Wrong project", releaseId: release.id },
          ],
        })
      ).status,
    ).toBe(404);
    expect((await ctx.create({ unassignedReleaseId: release.id })).status).toBe(
      404,
    );
    expect(await snapshot()).toEqual(before);
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect(
      (await ctx.create({ newTasks: [{ title: "Unauthorized" }] })).status,
    ).toBe(404);
    await db
      .update(schema.projectTable)
      .set({ workspaceId: outsider.workspace.id })
      .where(eq(schema.projectTable.id, ctx.project.id));
    await expect(
      createTask({
        projectId: ctx.project.id,
        expectedWorkspaceId: ctx.workspace.id,
        currentUserId: ctx.user.id,
        title: "Stale",
        type: "feature",
        featureComposition: {},
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it.each([undefined, "task", "bug"])(
    "rejects composition for non-Feature type %s",
    async (type) => {
      const ctx = await setup();
      const before = await snapshot();
      expect(
        (await ctx.create({ newTasks: [{ title: "Nested" }] }, { type }))
          .status,
      ).toBe(400);
      expect(await snapshot()).toEqual(before);
    },
  );
});
