import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { linkSelectedMilestoneTasks } from "../../apps/api/src/milestone/link-selected-tasks";
import { createApp } from "../../apps/api/src/index";
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
  const release = await insertRelease(fixture.project.id);
  const feature = await insertTask(fixture.project.id, {
    type: "feature",
    releaseId: release.id,
  });
  const task = await insertTask(fixture.project.id, {
    featureId: feature.id,
    releaseId: release.id,
    status: "to-do",
  });
  const [previous] = await db
    .insert(schema.milestoneTable)
    .values({ featureId: feature.id, title: "Previous" })
    .returning();
  const bug = await insertTask(fixture.project.id, {
    type: "bug",
    featureId: feature.id,
    milestoneId: previous!.id,
    releaseId: release.id,
    status: "done",
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const create = (taskIds?: string[], fields: Record<string, unknown> = {}) =>
    app.request(
      `/api/milestone/feature/${feature.id}`,
      jsonRequest("POST", {
        title: "Linked milestone",
        ...fields,
        ...(taskIds === undefined ? {} : { taskIds }),
      }),
    );
  return {
    ...member,
    ...fixture,
    feature,
    task,
    bug,
    release,
    previous: previous!,
    app,
    create,
  };
}
const taskRow = (id: string) =>
  db.query.taskTable.findFirst({ where: eq(schema.taskTable.id, id) });
const milestones = (featureId: string) =>
  db
    .select()
    .from(schema.milestoneTable)
    .where(eq(schema.milestoneTable.featureId, featureId));

async function expectUnchanged(ctx: Awaited<ReturnType<typeof setup>>) {
  expect(await milestones(ctx.feature.id)).toHaveLength(1);
  expect((await taskRow(ctx.task.id))?.milestoneId).toBeNull();
  expect((await taskRow(ctx.bug.id))?.milestoneId).toBe(ctx.previous.id);
  expect(await db.select().from(schema.activityTable)).toEqual([]);
}

describe("milestone creation with existing work", () => {
  it("assigns Task and Bug work atomically, including reassigning an existing milestone, and publishes committed refreshes", async () => {
    const ctx = await setup();
    const ownRelease = await insertRelease(ctx.project.id);
    await db
      .update(schema.taskTable)
      .set({ releaseId: ownRelease.id })
      .where(eq(schema.taskTable.id, ctx.bug.id));
    ctx.bug.releaseId = ownRelease.id;
    const history = await db
      .select()
      .from(schema.releaseProgressEventTable)
      .orderBy(schema.releaseProgressEventTable.id);
    const publish = vi
      .spyOn(events, "publishEvent")
      .mockImplementation(async (_name, data) => {
        const payload = data as { milestoneId?: string | null };
        if (payload.milestoneId && payload.milestoneId !== ctx.previous.id) {
          // A separate connection sees both links when the event is published.
          expect((await taskRow(ctx.task.id))?.milestoneId).toBe(
            payload.milestoneId,
          );
          expect((await taskRow(ctx.bug.id))?.milestoneId).toBe(
            payload.milestoneId,
          );
        }
      });
    const response = await ctx.create([ctx.task.id, ctx.bug.id]);
    expect(response.status).toBe(200);
    const milestone = await response.json();
    expect(milestone.progress).toEqual({ total: 2, started: 1, completed: 1 });
    for (const task of [ctx.task, ctx.bug]) {
      expect(await taskRow(task.id)).toMatchObject({
        milestoneId: milestone.id,
        featureId: ctx.feature.id,
        releaseId: task.releaseId,
        number: task.number,
        type: task.type,
      });
    }
    const activities = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.type, "milestone_changed"));
    expect(activities).toHaveLength(2);
    expect(
      activities.find((row) => row.taskId === ctx.bug.id)?.eventData,
    ).toMatchObject({
      oldMilestoneId: ctx.previous.id,
      oldMilestoneTitle: "Previous",
      newMilestoneId: milestone.id,
      newMilestoneTitle: "Linked milestone",
    });
    expect(
      await db
        .select()
        .from(schema.releaseProgressEventTable)
        .orderBy(schema.releaseProgressEventTable.id),
    ).toEqual(history);
    const taskUpdates = publish.mock.calls
      .filter(([event]) => event === "task.updated")
      .map(([, data]) => (data as { taskId: string }).taskId);
    expect(taskUpdates.sort()).toEqual(
      [ctx.feature.id, ctx.task.id, ctx.bug.id].sort(),
    );
    expect(
      publish.mock.calls
        .filter(([event]) => event === "milestone.changed")
        .map(([, data]) => (data as { milestoneId: string }).milestoneId)
        .sort(),
    ).toEqual([milestone.id, ctx.previous.id].sort());
    const previous = await (
      await ctx.app.request(`/api/milestone/${ctx.previous.id}`)
    ).json();
    expect(previous.progress).toEqual({ total: 0, started: 0, completed: 0 });
  });

  it.each([undefined, []])(
    "retains empty creation when taskIds is %j",
    async (ids) => {
      const ctx = await setup();
      const response = await ctx.create(ids);
      expect(response.status).toBe(200);
      expect((await response.json()).progress).toEqual({
        total: 0,
        started: 0,
        completed: 0,
      });
      expect((await taskRow(ctx.bug.id))?.milestoneId).toBe(ctx.previous.id);
      expect((await taskRow(ctx.task.id))?.milestoneId).toBeNull();
    },
  );

  it("rejects duplicate task ids before making any changes", async () => {
    const ctx = await setup();
    const publish = vi
      .spyOn(events, "publishEvent")
      .mockResolvedValue(undefined);
    expect((await ctx.create([ctx.task.id, ctx.task.id])).status).toBe(400);
    await expectUnchanged(ctx);
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects missing, deleted, Feature, outside-Feature and outside-project selections as one atomic operation", async () => {
    const ctx = await setup();
    const outsideFeature = await insertTask(ctx.project.id);
    const deleted = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
    });
    await db
      .delete(schema.taskTable)
      .where(eq(schema.taskTable.id, deleted.id));
    const otherProject = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const outsideProject = await insertTask(otherProject.project.id);
    const publish = vi
      .spyOn(events, "publishEvent")
      .mockResolvedValue(undefined);
    for (const id of [
      "missing",
      deleted.id,
      ctx.feature.id,
      outsideFeature.id,
      outsideProject.id,
    ]) {
      expect((await ctx.create([ctx.task.id, id])).status).toBe(409);
      await expectUnchanged(ctx);
    }
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not lock selected rows belonging to another project", async () => {
    const ctx = await setup();
    const other = await createProjectFixture({ workspaceId: ctx.workspace.id });
    const foreign = await insertTask(other.project.id);
    await db.transaction(async (holder) => {
      await holder
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, foreign.id))
        .for("update");
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`set local lock_timeout = '100ms'`);
          await tx
            .select()
            .from(schema.taskTable)
            .where(eq(schema.taskTable.id, ctx.feature.id))
            .for("update");
          await linkSelectedMilestoneTasks(
            tx,
            ctx.previous.id,
            ctx.feature,
            [ctx.task.id, foreign.id],
            ctx.user.id,
          );
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
    await expectUnchanged(ctx);
  });

  it("rolls back the milestone, earlier links and activity when a later assignment fails", async () => {
    const ctx = await setup();
    const last = [ctx.task, ctx.bug]
      .sort((a, b) => a.id.localeCompare(b.id))
      .at(-1)!;
    await db
      .update(schema.taskTable)
      .set({ title: "Force link failure" })
      .where(eq(schema.taskTable.id, last.id));
    await db.execute(
      sql`create function fail_selected_milestone_link() returns trigger language plpgsql as $$ begin if new.title = 'Force link failure' and new.milestone_id is distinct from old.milestone_id then raise exception 'forced late assignment failure'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger fail_selected_milestone_link before update on task for each row execute function fail_selected_milestone_link()`,
    );
    const publish = vi
      .spyOn(events, "publishEvent")
      .mockResolvedValue(undefined);
    try {
      expect((await ctx.create([ctx.task.id, ctx.bug.id])).status).toBe(500);
      await expectUnchanged(ctx);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      await db.execute(
        sql`drop function fail_selected_milestone_link() cascade`,
      );
    }
  });

  it("requires task:update to create and link selected work", async () => {
    const ctx = await setup("reader");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "reader",
      permission: JSON.stringify({ task: ["read"] }),
    });
    expect((await ctx.create([ctx.task.id, ctx.bug.id])).status).toBe(403);
    await expectUnchanged(ctx);
  });

  it("safely resolves selection racing deletion without retaining a deleted task link", async () => {
    const ctx = await setup();
    const [created, deleted] = await Promise.all([
      ctx.create([ctx.task.id]),
      ctx.app.request(`/api/task/${ctx.task.id}`, { method: "DELETE" }),
    ]);
    expect([200, 409]).toContain(created.status);
    expect(deleted.status).toBe(200);
    expect(await taskRow(ctx.task.id)).toBeUndefined();
    if (created.status === 200) {
      const milestone = await created.json();
      expect(
        (await (await ctx.app.request(`/api/milestone/${milestone.id}`)).json())
          .progress.total,
      ).toBe(0);
    } else expect(await milestones(ctx.feature.id)).toHaveLength(1);
  });

  it("safely resolves selection racing a project move and clears membership in moved work", async () => {
    const ctx = await setup();
    const target = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const [created, moved] = await Promise.all([
      ctx.create([ctx.task.id]),
      ctx.app.request(
        `/api/task/move/${ctx.task.id}`,
        jsonRequest("PUT", { destinationProjectId: target.project.id }),
      ),
    ]);
    expect([200, 409]).toContain(created.status);
    expect(moved.status).toBe(200);
    expect(await taskRow(ctx.task.id)).toMatchObject({
      projectId: target.project.id,
      featureId: null,
      milestoneId: null,
    });
    if (created.status === 409)
      expect(await milestones(ctx.feature.id)).toHaveLength(1);
  });
});
