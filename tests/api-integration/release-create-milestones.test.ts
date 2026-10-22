import { createHash, randomUUID } from "node:crypto";
import { asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

const publish = vi.hoisted(() =>
  vi.fn(async (_event: string, _data?: unknown) => undefined),
);
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/events")>()),
  publishEvent: publish,
}));

beforeEach(async () => {
  await resetTestDatabase();
  publish.mockReset();
  publish.mockResolvedValue(undefined);
});

const dates = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
};

async function setup(role = "owner") {
  const member = await createWorkspaceMember({ role });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const create = (
    body: Record<string, unknown> = {},
    headers?: Record<string, string>,
  ) =>
    app.request(
      `/api/release/project/${project.id}`,
      jsonRequest("POST", { name: "New release", ...dates, ...body }, headers),
    );
  const feature = await insertTask(project.id, {
    type: "feature",
    title: "Knowledge",
  });
  return { ...member, project, feature, app, create };
}

async function insertMilestone(
  featureId: string,
  values: Partial<typeof schema.milestoneTable.$inferInsert> = {},
) {
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({ featureId, title: "Delivery", position: 0, ...values })
    .returning();
  if (!milestone) throw new Error("Failed to insert milestone");
  return milestone;
}

async function snapshot() {
  const [releases, milestones, tasks, activity, history] = await Promise.all([
    db.select().from(schema.releaseTable).orderBy(asc(schema.releaseTable.id)),
    db
      .select()
      .from(schema.milestoneTable)
      .orderBy(asc(schema.milestoneTable.id)),
    db.select().from(schema.taskTable).orderBy(asc(schema.taskTable.id)),
    db
      .select()
      .from(schema.activityTable)
      .orderBy(asc(schema.activityTable.id)),
    db
      .select()
      .from(schema.releaseProgressEventTable)
      .orderBy(asc(schema.releaseProgressEventTable.id)),
  ]);
  return { releases, milestones, tasks, activity, history };
}

describe("creating a release with existing milestones", () => {
  it("links multiple milestones atomically and moves only null-release Task/Bug followers", async () => {
    const ctx = await setup();
    const overrideRelease = await insertRelease(ctx.project.id, {
      name: "Explicit override",
    });
    const milestone = await insertMilestone(ctx.feature.id, {
      leadId: ctx.user.id,
      priority: "medium",
    });
    const empty = await insertMilestone(ctx.feature.id, {
      title: "Empty",
      position: 1,
    });
    const followers = [
      await insertTask(ctx.project.id, {
        featureId: ctx.feature.id,
        milestoneId: milestone.id,
        startDate: new Date("2026-10-02T12:00:00Z"),
        dueDate: new Date("2026-10-04T12:00:00Z"),
      }),
      await insertTask(ctx.project.id, {
        featureId: ctx.feature.id,
        milestoneId: milestone.id,
        type: "bug",
        status: "done",
      }),
      await insertTask(ctx.project.id, {
        featureId: ctx.feature.id,
        milestoneId: milestone.id,
        status: "archived",
      }),
    ];
    const override = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
      type: "bug",
      releaseId: overrideRelease.id,
    });
    const unrelated = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
    });
    const visibleAtPublish: boolean[] = [];
    publish.mockImplementation(async () => {
      const linked = await db.query.milestoneTable.findFirst({
        where: eq(schema.milestoneTable.id, milestone.id),
      });
      const release = await db.query.releaseTable.findFirst({
        where: eq(schema.releaseTable.name, "New release"),
      });
      visibleAtPublish.push(
        Boolean(release && linked?.releaseId === release.id),
      );
    });

    const response = await ctx.create({
      milestoneIds: [empty.id, milestone.id],
      description: "Notes",
    });
    expect(response.status).toBe(200);
    const release = await response.json();
    expect(release).toMatchObject({
      projectId: ctx.project.id,
      name: "New release",
      description: "Notes",
      ...dates,
    });
    expect(release).not.toHaveProperty("milestones");
    expect(
      (
        await db
          .select()
          .from(schema.milestoneTable)
          .where(inArray(schema.milestoneTable.id, [milestone.id, empty.id]))
      ).map((row) => row.releaseId),
    ).toEqual([release.id, release.id]);
    expect(
      await db.query.milestoneTable.findFirst({
        where: eq(schema.milestoneTable.id, milestone.id),
      }),
    ).toMatchObject({
      featureId: ctx.feature.id,
      leadId: ctx.user.id,
      priority: "medium",
      position: 0,
    });
    for (const task of followers) {
      expect(
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, task.id),
        }),
      ).toEqual({
        ...task,
        releaseId: release.id,
        updatedAt: expect.any(Date),
      });
    }
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, override.id),
      }),
    ).toEqual(override);
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, unrelated.id),
      }),
    ).toEqual(unrelated);
    const history = await db
      .select()
      .from(schema.releaseProgressEventTable)
      .where(eq(schema.releaseProgressEventTable.releaseId, release.id));
    expect(history.filter((event) => event.status === null)).toHaveLength(1);
    expect(history.reduce((scope, event) => scope + event.delta, 0)).toBe(3);
    const activity = await db.select().from(schema.activityTable);
    for (const task of followers) {
      expect(activity).toContainEqual(
        expect.objectContaining({
          taskId: task.id,
          type: "release_changed",
          userId: ctx.user.id,
          eventData: expect.objectContaining({
            oldReleaseId: null,
            newReleaseId: release.id,
            newReleaseName: "New release",
          }),
        }),
      );
    }
    expect(
      activity.filter(
        (row) =>
          row.taskId === ctx.feature.id && row.type === "milestone_updated",
      ),
    ).toHaveLength(2);
    expect(
      publish.mock.calls.filter(([event]) => event === "release.changed"),
    ).toEqual([["release.changed", { projectId: ctx.project.id }]]);
    const updates = publish.mock.calls
      .filter(([event]) => event === "task.updated")
      .map(([, data]) => (data as { taskId: string }).taskId);
    expect(updates.sort()).toEqual(followers.map((task) => task.id).sort());
    for (const selected of [milestone, empty])
      expect(publish).toHaveBeenCalledWith("milestone.changed", {
        projectId: ctx.project.id,
        featureId: ctx.feature.id,
        milestoneId: selected.id,
        userId: ctx.user.id,
      });
    expect(visibleAtPublish.length).toBeGreaterThan(0);
    expect(visibleAtPublish.every(Boolean)).toBe(true);
  });

  it.each([undefined, []])(
    "keeps creation without milestone selections compatible (%j)",
    async (milestoneIds) => {
      const ctx = await setup();
      const milestone = await insertMilestone(ctx.feature.id);
      const response = await ctx.create(
        milestoneIds === undefined ? {} : { milestoneIds },
      );
      expect(response.status).toBe(200);
      expect((await response.json()).name).toBe("New release");
      expect(
        (
          await db.query.milestoneTable.findFirst({
            where: eq(schema.milestoneTable.id, milestone.id),
          })
        )?.releaseId,
      ).toBeNull();
    },
  );

  it("returns a distinct duplicate-name code without linking milestones", async () => {
    const ctx = await setup();
    await insertRelease(ctx.project.id, { name: "New release" });
    const milestone = await insertMilestone(ctx.feature.id);
    const before = await snapshot();
    const response = await ctx.create({ milestoneIds: [milestone.id] });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "RELEASE_NAME_TAKEN" });
    expect(await snapshot()).toEqual(before);
    expect(publish).not.toHaveBeenCalled();
  });

  it("accepts the maximum of 100 selected milestones", async () => {
    const ctx = await setup();
    const milestones = await db
      .insert(schema.milestoneTable)
      .values(
        Array.from({ length: 100 }, (_, position) => ({
          featureId: ctx.feature.id,
          title: `Milestone ${position}`,
          position,
        })),
      )
      .returning();
    const response = await ctx.create({
      milestoneIds: milestones.map((milestone) => milestone.id),
    });
    expect(response.status).toBe(200);
    const release = await response.json();
    const linked = await db
      .select()
      .from(schema.milestoneTable)
      .where(eq(schema.milestoneTable.releaseId, release.id));
    expect(linked).toHaveLength(100);
  });

  it.each([
    "missing",
    "assigned",
    "other-project",
    "other-workspace",
    "deleted",
  ])("rolls back all selections when one is %s", async (kind) => {
    const ctx = await setup();
    const valid = await insertMilestone(ctx.feature.id);
    let invalidId = "missing";
    if (kind === "assigned") {
      const assigned = await insertRelease(ctx.project.id);
      invalidId = (
        await insertMilestone(ctx.feature.id, { releaseId: assigned.id })
      ).id;
    } else if (kind === "deleted") {
      const deleted = await insertMilestone(ctx.feature.id);
      invalidId = deleted.id;
      await db
        .delete(schema.milestoneTable)
        .where(eq(schema.milestoneTable.id, invalidId));
    } else if (kind === "other-project" || kind === "other-workspace") {
      const workspaceId =
        kind === "other-project"
          ? ctx.workspace.id
          : (await createWorkspaceMember()).workspace.id;
      const { project } = await createProjectFixture({ workspaceId });
      const privateFeature = await insertTask(project.id, {
        type: "feature",
        title: "Secret Feature",
      });
      invalidId = (
        await insertMilestone(privateFeature.id, { title: "Secret milestone" })
      ).id;
    }
    const before = await snapshot();
    const response = await ctx.create({ milestoneIds: [valid.id, invalidId] });
    expect(response.status).toBe(409);
    const error = await response.json();
    expect(error).toMatchObject({ code: "MILESTONE_SELECTION_CONFLICT" });
    expect(JSON.stringify(error)).not.toContain("Secret");
    expect(await snapshot()).toEqual(before);
    expect(publish).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicate IDs", ["same", "same"]],
    ["empty ID", [""]],
    ["too many IDs", Array.from({ length: 101 }, (_, index) => `id-${index}`)],
    ["invalid array", null],
  ])("validates %s before writes", async (_label, milestoneIds) => {
    const ctx = await setup();
    const before = await snapshot();
    const response = await ctx.create({ milestoneIds });
    expect(response.status).toBe(400);
    expect(await snapshot()).toEqual(before);
    expect(publish).not.toHaveBeenCalled();
  });

  it("rolls back release, follower history and earlier links after a later database failure", async () => {
    const ctx = await setup();
    const first = await insertMilestone(ctx.feature.id, {
      id: `a${randomUUID()}`,
      title: "First",
    });
    const failing = await insertMilestone(ctx.feature.id, {
      id: `z${randomUUID()}`,
      title: "Reject link",
    });
    await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      milestoneId: first.id,
    });
    await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      milestoneId: failing.id,
      type: "bug",
    });
    const before = await snapshot();
    await db.execute(
      sql`create function reject_test_release_link() returns trigger as $$ begin if NEW.title = 'Reject link' and NEW.release_id is not null then raise exception 'Injected release link failure'; end if; return NEW; end; $$ language plpgsql`,
    );
    await db.execute(
      sql`create trigger reject_test_release_link before update on milestone for each row execute function reject_test_release_link()`,
    );
    try {
      const response = await ctx.create({
        milestoneIds: [first.id, failing.id],
      });
      expect(response.status).toBe(500);
      expect(await snapshot()).toEqual(before);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      await db.execute(sql`drop trigger reject_test_release_link on milestone`);
      await db.execute(sql`drop function reject_test_release_link()`);
    }
  });

  it("allows only one concurrent release to claim the same unassigned milestone", async () => {
    const ctx = await setup();
    const milestone = await insertMilestone(ctx.feature.id);
    const follower = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
    });
    const responses = await Promise.all([
      ctx.create({ name: "First release", milestoneIds: [milestone.id] }),
      ctx.create({ name: "Second release", milestoneIds: [milestone.id] }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const failure = responses.find((response) => response.status === 409)!;
    expect(await failure.json()).toMatchObject({
      code: "MILESTONE_SELECTION_CONFLICT",
    });
    const releases = await db.select().from(schema.releaseTable);
    expect(releases).toHaveLength(1);
    expect(
      (
        await db.query.milestoneTable.findFirst({
          where: eq(schema.milestoneTable.id, milestone.id),
        })
      )?.releaseId,
    ).toBe(releases[0].id);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, follower.id),
        })
      )?.releaseId,
    ).toBe(releases[0].id);
    expect(
      await db
        .select()
        .from(schema.releaseProgressEventTable)
        .where(isNull(schema.releaseProgressEventTable.status)),
    ).toHaveLength(1);
  });

  it("rechecks a milestone deleted while creation waits for its Feature lock", async () => {
    const ctx = await setup();
    const milestone = await insertMilestone(ctx.feature.id);
    let signalLocked!: () => void;
    let finish!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const blocker = db.transaction(async (tx) => {
      await tx
        .select({ id: schema.taskTable.id })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, ctx.feature.id))
        .for("update");
      signalLocked();
      await gate;
      await tx
        .delete(schema.milestoneTable)
        .where(eq(schema.milestoneTable.id, milestone.id));
    });
    await Promise.race([locked, blocker]);
    const response = ctx.create({ milestoneIds: [milestone.id] });
    try {
      await vi.waitFor(
        async () => {
          const waiters = await db.execute<{ waiting: number }>(
            sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike '%for update%'`,
          );
          expect(waiters.rows[0]?.waiting).toBeGreaterThan(0);
        },
        { timeout: 5_000, interval: 5 },
      );
    } finally {
      finish();
      await blocker;
    }
    const result = await response;
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({
      code: "MILESTONE_SELECTION_CONFLICT",
    });
    expect(await db.select().from(schema.releaseTable)).toEqual([]);
    expect(await db.select().from(schema.releaseProgressEventTable)).toEqual(
      [],
    );
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("release milestone creation permissions", () => {
  for (const authentication of ["custom-role", "api-key"] as const) {
    it.each([
      [{ project: ["update"] }, 403],
      [{ project: ["update"], task: ["read"] }, 403],
      [{ project: ["update"], task: ["update"] }, 200],
      [{ task: ["update"] }, 403],
    ] as [Record<string, string[]>, number][])(
      `${authentication} requires project:update and task:update %j`,
      async (permissions, status) => {
        const ctx = await setup(
          authentication === "custom-role" ? "release_composer" : "owner",
        );
        const milestone = await insertMilestone(ctx.feature.id);
        const headers: Record<string, string> = {};
        if (authentication === "custom-role") {
          await db.insert(schema.workspaceRoleTable).values({
            workspaceId: ctx.workspace.id,
            role: "release_composer",
            permission: JSON.stringify(permissions),
          });
        } else {
          const key = `kaneo_test_${randomUUID()}`;
          await db.insert(schema.apikeyTable).values({
            referenceId: ctx.user.id,
            userId: ctx.user.id,
            key: createHash("sha256").update(key).digest("base64url"),
            name: "Release composition",
            createdAt: new Date(),
            updatedAt: new Date(),
            permissions: JSON.stringify(permissions),
            enabled: true,
          });
          headers.Authorization = `Bearer ${key}`;
          mockAnonymousSession();
        }
        expect(
          (await ctx.create({ milestoneIds: [milestone.id] }, headers)).status,
        ).toBe(status);
        if (status === 403) {
          expect(await db.select().from(schema.releaseTable)).toEqual([]);
          expect(publish).not.toHaveBeenCalled();
        }
      },
    );
  }

  it("does not require task:update for omitted or empty selections", async () => {
    const ctx = await setup("release_only");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "release_only",
      permission: JSON.stringify({ project: ["update"] }),
    });
    expect((await ctx.create()).status).toBe(200);
    expect(
      (await ctx.create({ name: "Empty selection", milestoneIds: [] })).status,
    ).toBe(200);
  });

  it("rejects anonymous and foreign-workspace creation without linking selected work", async () => {
    const ctx = await setup();
    const milestone = await insertMilestone(ctx.feature.id);
    const before = await snapshot();
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect((await ctx.create({ milestoneIds: [milestone.id] })).status).toBe(
      404,
    );
    mockAnonymousSession();
    expect((await ctx.create({ milestoneIds: [milestone.id] })).status).toBe(
      401,
    );
    expect(await snapshot()).toEqual(before);
    expect(publish).not.toHaveBeenCalled();
  });
});
