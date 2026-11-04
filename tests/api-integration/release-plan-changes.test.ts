import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import type { ReleasePlanChanges as Changes } from "../../apps/api/src/scheduling/release-changes-schema";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";
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

const nextDraft = {
  key: "next",
  name: "Next draft release",
  startDate: "2027-01-11",
  codeFreezeDate: "2027-01-15",
  submissionDate: "2027-01-17",
};

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
  const release = async (
    name: string,
    values: Partial<typeof schema.releaseTable.$inferInsert> = {},
  ) => {
    const [row] = await db
      .insert(schema.releaseTable)
      .values({
        projectId: fixture.project.id,
        name,
        startDate: "2027-01-04",
        codeFreezeDate: "2027-01-04",
        submissionDate: "2027-01-10",
        ...values,
      })
      .returning();
    return row!;
  };
  const base = (releaseId: string) =>
    `/project-schedule/${fixture.project.id}/release/${releaseId}`;
  const preview = async (
    releaseId: string,
    changes?: Changes,
    timeZone = "UTC",
  ) => {
    const response = await call("POST", `${base(releaseId)}/preview`, {
      timeZone,
      ...(changes ? { changes } : {}),
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  const apply = (
    releaseId: string,
    proposal: {
      asOf: string;
      revision: string;
      generation: number;
      timeZone: string;
      changes?: Changes;
    },
    changes = proposal.changes,
  ) =>
    call("POST", `${base(releaseId)}/apply`, {
      asOf: proposal.asOf,
      revision: proposal.revision,
      generation: proposal.generation,
      timeZone: proposal.timeZone,
      ...(changes ? { changes } : {}),
    });
  const leaf = (
    releaseId: string,
    values: Partial<typeof schema.taskTable.$inferInsert> = {},
  ) =>
    insertTask(fixture.project.id, {
      userId: member.user.id,
      estimateSeconds: 7200,
      releaseId,
      ...values,
    });
  const task = (id: string) =>
    db.query.taskTable.findFirst({ where: eq(schema.taskTable.id, id) });
  return {
    ...member,
    ...fixture,
    app,
    call,
    release,
    base,
    preview,
    apply,
    leaf,
    task,
  };
}

describe("code-freeze planning conflicts and atomic fixes", () => {
  it("rejects late release Apply before writing placements, reminders, plans, or publication events", async () => {
    const ctx = await setup();
    const release = await ctx.release("Deadline");
    const task = await ctx.leaf(release.id, { estimateSeconds: 9 * 3600 });
    await db
      .insert(schema.taskReminderSentTable)
      .values({ taskId: task.id, reminderType: "configured_before" });
    const beforeTask = await ctx.task(task.id);
    const proposal = await ctx.preview(release.id);
    expect(proposal.warnings).toContainEqual({
      taskId: task.id,
      reason: "after_code_freeze",
    });
    publish.mockClear();
    const response = await ctx.apply(release.id, proposal);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "PLAN_AFTER_CODE_FREEZE",
    });
    expect(await ctx.task(task.id)).toEqual(beforeTask);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
    expect(await db.select().from(schema.taskReminderSentTable)).toHaveLength(
      1,
    );
    expect(publish).not.toHaveBeenCalled();
  });

  it("allows finishes during the code-freeze day and preserves completed placements after it", async () => {
    const ctx = await setup();
    const release = await ctx.release("Finish on freeze");
    const current = await ctx.leaf(release.id, { estimateSeconds: 8 * 3600 });
    const completed = await ctx.leaf(release.id, {
      status: "done",
      startDate: new Date("2027-01-12T09:00:00Z"),
      dueDate: new Date("2027-01-12T12:00:00Z"),
    });
    const proposal = await ctx.preview(release.id);
    expect(
      proposal.tasks.find(
        (row: { taskId: string }) => row.taskId === current.id,
      ).end,
    ).toBe("2027-01-04T17:00:00.000Z");
    expect(proposal.warnings).toEqual([]);
    expect((await ctx.apply(release.id, proposal)).status).toBe(200);
    expect((await ctx.task(completed.id))?.dueDate).toEqual(completed.dueDate);
  });

  it.each([
    { hours: 16, late: false },
    { hours: 17, late: true },
  ])(
    "evaluates freeze boundaries across spring DST in the planning timezone ($hours hours)",
    async ({ hours, late }) => {
      const ctx = await setup();
      const release = await ctx.release("DST deadline", {
        startDate: "2027-03-12",
        codeFreezeDate: "2027-03-15",
        submissionDate: "2027-03-20",
      });
      const task = await ctx.leaf(release.id, {
        estimateSeconds: hours * 3600,
      });
      const proposal = await ctx.preview(
        release.id,
        undefined,
        "America/New_York",
      );
      const row = proposal.tasks.find(
        (item: { taskId: string }) => item.taskId === task.id,
      );
      expect(row.segments[0].start).toBe("2027-03-12T14:00:00.000Z");
      expect(row.segments[1].start).toBe("2027-03-15T13:00:00.000Z");
      expect(
        proposal.warnings.some(
          (warning: { reason: string }) =>
            warning.reason === "after_code_freeze",
        ),
      ).toBe(late);
      expect((await ctx.apply(release.id, proposal)).status).toBe(
        late ? 422 : 200,
      );
    },
  );

  it.each([
    { seconds: 15 * 3600, expected: 200 },
    { seconds: 15 * 3600 + 60, expected: 422 },
  ])(
    "protects project-wide Apply and treats next-midnight finishes as exclusive ($seconds seconds)",
    async ({ seconds, expected }) => {
      const ctx = await setup();
      const release = await ctx.release("Midnight deadline");
      await ctx.leaf(release.id, { estimateSeconds: seconds });
      const base = `/project-schedule/${ctx.project.id}`;
      expect(
        (
          await ctx.call("PUT", `${base}/settings`, {
            timeZone: "America/New_York",
            estimateDayMinutes: 480,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await ctx.call(
            "PUT",
            `/work-calendar/${ctx.workspace.id}/${ctx.user.id}`,
            {
              timeZone: "America/New_York",
              weeklyIntervals: [1, 2, 3, 4, 5].map((weekday) => ({
                weekday,
                startMinute: 540,
                endMinute: 1440,
              })),
              timeOff: [],
            },
          )
        ).status,
      ).toBe(200);
      const previewResponse = await ctx.call("POST", `${base}/preview`, {
        planFrom: "2027-01-04T14:00:00Z",
      });
      expect(previewResponse.status).toBe(200);
      const proposal = await previewResponse.json();
      if (expected === 200)
        expect(proposal.tasks[0].end).toBe("2027-01-05T05:00:00.000Z");
      const response = await ctx.call("POST", `${base}/apply`, {
        asOf: proposal.asOf,
        planFrom: proposal.planFrom,
        revision: proposal.revision,
        generation: proposal.generation,
      });
      expect(response.status).toBe(expected);
      if (expected === 422) {
        expect(await response.json()).toMatchObject({
          code: "PLAN_AFTER_CODE_FREEZE",
        });
        expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
      }
    },
  );

  it("previews date changes without saving and atomically applies a conflict-free reviewed date pair", async () => {
    const ctx = await setup();
    const release = await ctx.release("Draft dates");
    await ctx.leaf(release.id, { estimateSeconds: 9 * 3600 });
    const changes: Changes = {
      releaseDates: {
        codeFreezeDate: "2027-01-05",
        submissionDate: "2027-01-11",
      },
    };
    const proposal = await ctx.preview(release.id, changes);
    expect(proposal.releaseDates).toEqual({
      startDate: release.startDate,
      ...changes.releaseDates,
    });
    expect(proposal.warnings).toEqual([]);
    expect(
      (
        await db.query.releaseTable.findFirst({
          where: eq(schema.releaseTable.id, release.id),
        })
      )?.codeFreezeDate,
    ).toBe("2027-01-04");
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
    expect((await ctx.apply(release.id, proposal, changes)).status).toBe(200);
    expect(
      await db.query.releaseTable.findFirst({
        where: eq(schema.releaseTable.id, release.id),
      }),
    ).toMatchObject(changes.releaseDates!);
    expect(
      await (await ctx.call("GET", ctx.base(release.id))).json(),
    ).toMatchObject({ generation: 1, outdated: false });
  });

  it("returns snapshot milestone and Feature metadata without conflating duplicate milestone titles", async () => {
    const ctx = await setup();
    const release = await ctx.release("Grouped conflicts");
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Feature one",
    });
    const otherFeature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Feature two",
    });
    const [first, second] = await db
      .insert(schema.milestoneTable)
      .values([
        { featureId: feature.id, title: "Delivery", position: 3 },
        { featureId: otherFeature.id, title: "Delivery", position: 7 },
      ])
      .returning();
    const task = await ctx.leaf(release.id, {
      featureId: feature.id,
      milestoneId: first!.id,
    });
    const bug = await ctx.leaf(release.id, {
      type: "bug",
      featureId: otherFeature.id,
      milestoneId: second!.id,
    });
    const ungrouped = await ctx.leaf(release.id);
    const proposal = await ctx.preview(release.id);
    expect(
      proposal.tasks.find((row: { taskId: string }) => row.taskId === task.id),
    ).toMatchObject({
      featureId: feature.id,
      featureTitle: "Feature one",
      milestoneId: first!.id,
      milestoneTitle: "Delivery",
      milestonePosition: 3,
    });
    expect(
      proposal.tasks.find((row: { taskId: string }) => row.taskId === bug.id),
    ).toMatchObject({
      featureId: otherFeature.id,
      featureTitle: "Feature two",
      milestoneId: second!.id,
      milestoneTitle: "Delivery",
      milestonePosition: 7,
    });
    expect(
      proposal.tasks.find(
        (row: { taskId: string }) => row.taskId === ungrouped.id,
      ),
    ).toMatchObject({
      featureId: null,
      featureTitle: null,
      milestoneId: null,
      milestoneTitle: null,
      milestonePosition: null,
    });
  });

  it("moves only selected work, frees its old placement, preserves hierarchy and dependencies, and keeps the destination unscheduled", async () => {
    const ctx = await setup();
    const release = await ctx.release("Source");
    const next = await ctx.release("Next", {
      startDate: "2027-01-11",
      codeFreezeDate: "2027-01-15",
      submissionDate: "2027-01-17",
    });
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Knowledge",
    });
    const [milestone] = await db
      .insert(schema.milestoneTable)
      .values({
        featureId: feature.id,
        title: "Milestone",
        position: 0,
        releaseId: release.id,
      })
      .returning();
    const moved = await ctx.leaf(release.id, {
      featureId: feature.id,
      milestoneId: milestone!.id,
      priority: "urgent",
      estimateSeconds: 8 * 3600,
    });
    const remaining = await ctx.leaf(release.id, {
      featureId: feature.id,
      milestoneId: milestone!.id,
      estimateSeconds: 2 * 3600,
    });
    const follower = await ctx.leaf(next.id, { status: "done" });
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: moved.id,
      targetTaskId: follower.id,
      relationType: "blocks",
    });
    const historyBeforePlanning = await db
      .select()
      .from(schema.releaseProgressEventTable)
      .orderBy(schema.releaseProgressEventTable.id);
    const published = await ctx.preview(release.id, {
      releaseDates: {
        codeFreezeDate: "2027-01-08",
        submissionDate: "2027-01-10",
      },
    });
    expect(
      (await ctx.apply(release.id, published, published.changes)).status,
    ).toBe(200);
    expect(
      await db
        .select()
        .from(schema.releaseProgressEventTable)
        .orderBy(schema.releaseProgressEventTable.id),
    ).toEqual(historyBeforePlanning);
    const priorPlan = await db.query.projectPlanTable.findFirst({
      where: eq(schema.projectPlanTable.generation, 1),
    });
    const oldMoved = await ctx.task(moved.id);
    expect(oldMoved?.scheduleSegments?.length).toBeGreaterThan(0);
    await db
      .insert(schema.taskReminderSentTable)
      .values({ taskId: moved.id, reminderType: "configured_before" });
    const changes: Changes = {
      moves: [{ taskId: moved.id, target: { releaseId: next.id } }],
      releaseDates: {
        codeFreezeDate: "2027-01-04",
        submissionDate: "2027-01-10",
      },
    };
    const proposal = await ctx.preview(release.id, changes);
    expect(proposal.tasks.map((row: { taskId: string }) => row.taskId)).toEqual(
      [remaining.id],
    );
    expect(proposal.tasks[0]).toMatchObject({
      start: "2027-01-04T09:00:00.000Z",
      end: "2027-01-04T11:00:00.000Z",
    });
    expect((await ctx.task(moved.id))?.releaseId).toBe(release.id);
    expect((await ctx.task(moved.id))?.scheduleSegments).toEqual(
      oldMoved?.scheduleSegments,
    );
    publish.mockClear();
    const visibleAtPublish: boolean[] = [];
    publish.mockImplementation(async () => {
      const row = await ctx.task(moved.id);
      visibleAtPublish.push(
        row?.releaseId === next.id &&
          row.startDate === null &&
          (await db.select().from(schema.projectPlanTable)).length === 2,
      );
    });
    const response = await ctx.apply(release.id, proposal, changes);
    expect(response.status).toBe(200);
    expect(await ctx.task(moved.id)).toMatchObject({
      releaseId: next.id,
      featureId: feature.id,
      milestoneId: milestone!.id,
      userId: ctx.user.id,
      estimateSeconds: moved.estimateSeconds,
      priority: "urgent",
      startDate: null,
      dueDate: null,
      scheduledAssigneeId: null,
    });
    expect((await ctx.task(moved.id))?.scheduleSegments ?? []).toEqual([]);
    expect((await ctx.task(follower.id))?.releaseId).toBe(next.id);
    expect(await db.select().from(schema.taskRelationTable)).toHaveLength(1);
    expect(
      (
        await db.query.milestoneTable.findFirst({
          where: eq(schema.milestoneTable.id, milestone!.id),
        })
      )?.releaseId,
    ).toBe(release.id);
    expect(await db.select().from(schema.taskReminderSentTable)).toHaveLength(
      0,
    );
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(2);
    expect(
      await db.query.projectPlanTable.findFirst({
        where: eq(schema.projectPlanTable.generation, 1),
      }),
    ).toEqual(priorPlan);
    const oldEventIds = new Set(historyBeforePlanning.map((event) => event.id));
    const membershipDeltas = (
      await db.select().from(schema.releaseProgressEventTable)
    )
      .filter((event) => !oldEventIds.has(event.id) && event.status !== null)
      .map(({ releaseId, status, delta }) => ({ releaseId, status, delta }));
    expect(membershipDeltas).toHaveLength(2);
    expect(membershipDeltas).toEqual(
      expect.arrayContaining([
        { releaseId: release.id, status: "to-do", delta: -1 },
        { releaseId: next.id, status: "to-do", delta: 1 },
      ]),
    );
    expect(visibleAtPublish.length).toBeGreaterThan(0);
    expect(visibleAtPublish.every(Boolean)).toBe(true);
    expect(publish.mock.calls.map(([event]) => event)).toContain(
      "project-schedule.changed",
    );
    const own = await (await ctx.call("GET", ctx.base(release.id))).json();
    expect(own).toMatchObject({ outdated: false, generation: 2 });
    const activity = await db
      .select()
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, moved.id),
          eq(schema.activityTable.type, "release_changed"),
        ),
      );
    expect(activity).toHaveLength(1);
    expect(activity[0]?.eventData).toMatchObject({
      oldReleaseId: release.id,
      newReleaseId: next.id,
    });
    const target = await (await ctx.call("GET", ctx.base(next.id))).json();
    expect(target).toMatchObject({ planned: false });
    expect(
      target.tasks.find((row: { taskId: string }) => row.taskId === moved.id),
    ).toMatchObject({ start: null, end: null, segments: [] });
  });

  it("creates a draft destination only on Apply and supports deferring every remaining task", async () => {
    const ctx = await setup();
    const release = await ctx.release("Empty source after moving");
    const task = await ctx.leaf(release.id, { estimateSeconds: 20 * 3600 });
    const changes: Changes = {
      newRelease: nextDraft,
      moves: [{ taskId: task.id, target: { draftKey: nextDraft.key } }],
    };
    const proposal = await ctx.preview(release.id, changes);
    expect(proposal.tasks).toEqual([]);
    expect(proposal.warnings).toEqual([]);
    expect(proposal).toMatchObject({ scheduledCount: 0, unscheduledCount: 0 });
    expect(await db.select().from(schema.releaseTable)).toHaveLength(1);
    expect(await db.select().from(schema.activityTable)).toHaveLength(0);
    expect(publish).not.toHaveBeenCalled();
    const response = await ctx.apply(release.id, proposal, changes);
    expect(response.status).toBe(200);
    const destination = await db.query.releaseTable.findFirst({
      where: eq(schema.releaseTable.name, nextDraft.name),
    });
    expect(destination).toMatchObject({
      projectId: ctx.project.id,
      startDate: nextDraft.startDate,
    });
    expect((await ctx.task(task.id))?.releaseId).toBe(destination?.id);
    expect(
      await (await ctx.call("GET", ctx.base(release.id))).json(),
    ).toMatchObject({ planned: true, outdated: false, tasks: [] });
    expect(
      await (
        await ctx.call("GET", `/project-schedule/${ctx.project.id}`)
      ).json(),
    ).toMatchObject({ outdated: false });
    expect((await ctx.apply(release.id, proposal, changes)).status).toBe(409);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(2);
  });

  it("reviews and applies a milestone move with its unfinished source work and individual overrides", async () => {
    const ctx = await setup();
    const source = await ctx.release("Source milestone work");
    const other = await ctx.release("Another release", {
      startDate: "2027-01-18",
      codeFreezeDate: "2027-01-22",
      submissionDate: "2027-01-24",
    });
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const [milestone] = await db
      .insert(schema.milestoneTable)
      .values({ featureId: feature.id, title: "Delivery" })
      .returning();
    const membership = { featureId: feature.id, milestoneId: milestone!.id };
    const fitting = await ctx.leaf(source.id, {
      ...membership,
      priority: "urgent",
      startDate: new Date("2027-01-04T09:00:00Z"),
      dueDate: new Date("2027-01-04T11:00:00Z"),
    });
    const late = await ctx.leaf(source.id, {
      ...membership,
      type: "bug",
      estimateSeconds: 9 * 3600,
    });
    const completed = await ctx.leaf(source.id, {
      ...membership,
      status: "done",
    });
    const archived = await ctx.leaf(source.id, {
      ...membership,
      status: "archived",
    });
    const foreign = await ctx.leaf(other.id, membership);
    const ungrouped = await ctx.leaf(source.id);
    const before = await ctx.preview(source.id);
    expect(before.warnings).toContainEqual({
      taskId: late.id,
      reason: "after_code_freeze",
    });
    expect(before.tasks).toContainEqual(
      expect.objectContaining({
        taskId: fitting.id,
        milestoneId: milestone!.id,
        milestoneReleaseId: null,
      }),
    );
    const changes: Changes = {
      newRelease: nextDraft,
      milestoneMoves: [
        { milestoneId: milestone!.id, target: { draftKey: nextDraft.key } },
      ],
      moves: [{ taskId: late.id, target: { releaseId: other.id } }],
    };
    const proposal = await ctx.preview(source.id, changes);
    expect(proposal.changes).toEqual(changes);
    expect(proposal.warnings).toEqual([]);
    expect(
      proposal.tasks.map(({ taskId }: { taskId: string }) => taskId).sort(),
    ).toEqual([completed.id, archived.id, ungrouped.id].sort());
    expect((await ctx.task(fitting.id))?.releaseId).toBe(source.id);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(2);

    await db
      .update(schema.milestoneTable)
      .set({ releaseId: source.id })
      .where(eq(schema.milestoneTable.id, milestone!.id));
    expect((await ctx.apply(source.id, proposal)).status).toBe(409);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);

    await db
      .update(schema.milestoneTable)
      .set({ releaseId: other.id })
      .where(eq(schema.milestoneTable.id, milestone!.id));
    const assignedElsewhere = await ctx.call(
      "POST",
      `${ctx.base(source.id)}/preview`,
      { changes },
    );
    expect(assignedElsewhere.status).toBe(409);
    await db
      .update(schema.milestoneTable)
      .set({ releaseId: source.id })
      .where(eq(schema.milestoneTable.id, milestone!.id));
    const reviewed = await ctx.preview(source.id, changes);
    await db
      .update(schema.taskTable)
      .set({ milestoneId: null })
      .where(eq(schema.taskTable.id, late.id));
    expect((await ctx.apply(source.id, reviewed)).status).toBe(409);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(2);
    await db
      .update(schema.taskTable)
      .set({ milestoneId: milestone!.id })
      .where(eq(schema.taskTable.id, late.id));
    const finalProposal = await ctx.preview(source.id, changes);
    const applied = await ctx.apply(source.id, finalProposal);
    expect(applied.status).toBe(200);
    expect((await applied.json()).tasks).toContainEqual(
      expect.objectContaining({ taskId: archived.id, reason: "archived" }),
    );

    const destination = await db.query.releaseTable.findFirst({
      where: eq(schema.releaseTable.name, nextDraft.name),
    });
    expect(destination).toBeDefined();
    expect(await ctx.task(fitting.id)).toMatchObject({
      releaseId: destination!.id,
      milestoneId: milestone!.id,
      startDate: null,
      dueDate: null,
      scheduleSegments: [],
    });
    expect(await ctx.task(late.id)).toMatchObject({
      releaseId: other.id,
      milestoneId: milestone!.id,
    });
    expect((await ctx.task(completed.id))?.releaseId).toBe(source.id);
    expect((await ctx.task(archived.id))?.releaseId).toBe(source.id);
    expect((await ctx.task(foreign.id))?.releaseId).toBe(other.id);
    expect(
      await db.query.milestoneTable.findFirst({
        where: eq(schema.milestoneTable.id, milestone!.id),
      }),
    ).toMatchObject({ releaseId: destination!.id });
    expect(publish).toHaveBeenCalledWith("milestone.changed", {
      projectId: ctx.project.id,
      featureId: feature.id,
      milestoneId: milestone!.id,
      userId: ctx.user.id,
    });
  });

  it("binds draft changes to approval and rolls back stale Apply without creating its destination", async () => {
    const ctx = await setup();
    const release = await ctx.release("Bound drafts");
    const task = await ctx.leaf(release.id);
    const changes: Changes = {
      newRelease: nextDraft,
      moves: [{ taskId: task.id, target: { draftKey: nextDraft.key } }],
    };
    const proposal = await ctx.preview(release.id, changes);
    expect(
      (
        await ctx.apply(release.id, proposal, {
          ...changes,
          newRelease: { ...nextDraft, name: "Tampered destination" },
        })
      ).status,
    ).toBe(409);
    await db
      .update(schema.taskTable)
      .set({ estimateSeconds: 10800 })
      .where(eq(schema.taskTable.id, task.id));
    publish.mockClear();
    expect((await ctx.apply(release.id, proposal, changes)).status).toBe(409);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(1);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
    expect((await ctx.task(task.id))?.releaseId).toBe(release.id);
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes concurrent draft Applies only once without duplicating the destination or membership activity", async () => {
    const ctx = await setup();
    const release = await ctx.release("Concurrent draft publication");
    const task = await ctx.leaf(release.id);
    const changes: Changes = {
      newRelease: nextDraft,
      moves: [{ taskId: task.id, target: { draftKey: nextDraft.key } }],
    };
    const proposal = await ctx.preview(release.id, changes);
    const responses = await Promise.all([
      ctx.apply(release.id, proposal, changes),
      ctx.apply(release.id, proposal, changes),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(2);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.activityTable)
        .where(eq(schema.activityTable.type, "release_changed")),
    ).toHaveLength(1);
  });

  it("canonicalizes move ordering and drops an unused draft destination without creating it", async () => {
    const ctx = await setup();
    const release = await ctx.release("Canonical moves");
    const next = await ctx.release("Existing next", {
      startDate: "2027-01-11",
      codeFreezeDate: "2027-01-15",
      submissionDate: "2027-01-17",
    });
    const first = await ctx.leaf(release.id);
    const second = await ctx.leaf(release.id, { type: "bug" });
    const moves = [first, second].map((task) => ({
      taskId: task.id,
      target: { releaseId: next.id },
    }));
    const changes: Changes = { newRelease: nextDraft, moves };
    const proposal = await ctx.preview(release.id, changes);
    expect(proposal.changes.newRelease).toBeUndefined();
    expect(
      (
        await ctx.apply(release.id, proposal, {
          ...changes,
          moves: [...moves].reverse(),
        })
      ).status,
    ).toBe(200);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(2);
    expect((await ctx.task(first.id))?.releaseId).toBe(next.id);
    expect((await ctx.task(second.id))?.releaseId).toBe(next.id);
  });

  it("rolls back a reviewed bundle when selected work is deleted before Apply", async () => {
    const ctx = await setup();
    const release = await ctx.release("Deleted selection");
    const task = await ctx.leaf(release.id);
    const changes: Changes = {
      newRelease: nextDraft,
      releaseDates: {
        codeFreezeDate: "2027-01-05",
        submissionDate: "2027-01-11",
      },
      moves: [{ taskId: task.id, target: { draftKey: nextDraft.key } }],
    };
    const proposal = await ctx.preview(release.id, changes);
    await db.delete(schema.taskTable).where(eq(schema.taskTable.id, task.id));
    publish.mockClear();
    expect((await ctx.apply(release.id, proposal, changes)).status).toBe(409);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(1);
    expect(
      (
        await db.query.releaseTable.findFirst({
          where: eq(schema.releaseTable.id, release.id),
        })
      )?.codeFreezeDate,
    ).toBe(release.codeFreezeDate);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
    expect(publish).not.toHaveBeenCalled();
  });

  it("rolls back a new destination and date edits when a later membership write fails", async () => {
    const ctx = await setup();
    const release = await ctx.release("Atomic rollback after writes");
    const task = await ctx.leaf(release.id);
    const changes: Changes = {
      newRelease: nextDraft,
      releaseDates: {
        codeFreezeDate: "2027-01-05",
        submissionDate: "2027-01-11",
      },
      moves: [{ taskId: task.id, target: { draftKey: nextDraft.key } }],
    };
    const proposal = await ctx.preview(release.id, changes);
    await db.execute(
      sql`create function kaneo_test_fail_plan_move() returns trigger language plpgsql as $$ begin raise exception 'forced plan membership failure'; end $$`,
    );
    try {
      await db.execute(
        sql`create trigger kaneo_test_fail_plan_move before update of release_id on task for each row when (old.release_id is distinct from new.release_id) execute function kaneo_test_fail_plan_move()`,
      );
      publish.mockClear();
      expect((await ctx.apply(release.id, proposal, changes)).status).toBe(500);
      expect(await db.select().from(schema.releaseTable)).toHaveLength(1);
      expect(
        (
          await db.query.releaseTable.findFirst({
            where: eq(schema.releaseTable.id, release.id),
          })
        )?.codeFreezeDate,
      ).toBe(release.codeFreezeDate);
      expect((await ctx.task(task.id))?.releaseId).toBe(release.id);
      expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
      expect(await db.select().from(schema.activityTable)).toHaveLength(0);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      await db.execute(
        sql`drop trigger if exists kaneo_test_fail_plan_move on task`,
      );
      await db.execute(
        sql`drop function if exists kaneo_test_fail_plan_move()`,
      );
    }
  });

  it("rolls back combined date edits and moves if another remaining task is still late", async () => {
    const ctx = await setup();
    const release = await ctx.release("Partial resolution");
    const moved = await ctx.leaf(release.id);
    await ctx.leaf(release.id, { estimateSeconds: 24 * 3600 });
    const changes: Changes = {
      releaseDates: {
        codeFreezeDate: "2027-01-05",
        submissionDate: "2027-01-12",
      },
      newRelease: nextDraft,
      moves: [{ taskId: moved.id, target: { draftKey: nextDraft.key } }],
    };
    const proposal = await ctx.preview(release.id, changes);
    expect((await ctx.apply(release.id, proposal, changes)).status).toBe(422);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(1);
    expect(
      (
        await db.query.releaseTable.findFirst({
          where: eq(schema.releaseTable.id, release.id),
        })
      )?.codeFreezeDate,
    ).toBe(release.codeFreezeDate);
    expect((await ctx.task(moved.id))?.releaseId).toBe(release.id);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
    expect(await db.select().from(schema.activityTable)).toHaveLength(0);
  });

  it("rejects duplicate move IDs and unknown draft references without saving anything", async () => {
    const ctx = await setup();
    const release = await ctx.release("Invalid draft references");
    const next = await ctx.release("Next", {
      startDate: "2027-01-11",
      codeFreezeDate: "2027-01-15",
      submissionDate: "2027-01-17",
    });
    const task = await ctx.leaf(release.id);
    for (const changes of [
      {
        moves: [
          { taskId: task.id, target: { releaseId: next.id } },
          { taskId: task.id, target: { releaseId: next.id } },
        ],
      },
      { moves: [{ taskId: task.id, target: { draftKey: "unknown" } }] },
    ]) {
      const response = await ctx.call(
        "POST",
        `${ctx.base(release.id)}/preview`,
        { timeZone: "UTC", changes },
      );
      expect(response.status).toBe(400);
    }
    expect((await ctx.task(task.id))?.releaseId).toBe(release.id);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
  });

  it("rejects invalid date pairs, completed/archived moves, and destinations which are not later", async () => {
    const ctx = await setup();
    const release = await ctx.release("Eligibility");
    const sameStart = await ctx.release("Same start");
    const next = await ctx.release("Later", {
      startDate: "2027-01-11",
      codeFreezeDate: "2027-01-15",
      submissionDate: "2027-01-17",
    });
    const ready = await ctx.leaf(release.id);
    const done = await ctx.leaf(release.id, { status: "done" });
    const archived = await ctx.leaf(release.id, { status: "archived" });
    const invalid = [
      {
        releaseDates: {
          codeFreezeDate: "2027-01-03",
          submissionDate: "2027-01-10",
        },
      },
      { moves: [{ taskId: ready.id, target: { releaseId: sameStart.id } }] },
      { moves: [{ taskId: done.id, target: { releaseId: next.id } }] },
      { moves: [{ taskId: archived.id, target: { releaseId: next.id } }] },
    ];
    for (const changes of invalid) {
      const response = await ctx.call(
        "POST",
        `${ctx.base(release.id)}/preview`,
        { timeZone: "UTC", changes },
      );
      expect([400, 409]).toContain(response.status);
    }
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
  });

  it("keeps foreign-project release metadata private and rejects moved-out selections", async () => {
    const ctx = await setup();
    const release = await ctx.release("Isolation");
    const task = await ctx.leaf(release.id);
    const foreign = await createWorkspaceMember({ role: "owner" });
    const foreignProject = await createProjectFixture({
      workspaceId: foreign.workspace.id,
    });
    const [foreignRelease] = await db
      .insert(schema.releaseTable)
      .values({
        projectId: foreignProject.project.id,
        name: "Private release title",
        startDate: nextDraft.startDate,
        codeFreezeDate: nextDraft.codeFreezeDate,
        submissionDate: nextDraft.submissionDate,
      })
      .returning();
    const response = await ctx.call("POST", `${ctx.base(release.id)}/preview`, {
      timeZone: "UTC",
      changes: {
        moves: [{ taskId: task.id, target: { releaseId: foreignRelease!.id } }],
      },
    });
    expect([404, 409]).toContain(response.status);
    expect(await response.text()).not.toContain("Private release title");
    const next = await ctx.release("Next", {
      startDate: "2027-01-11",
      codeFreezeDate: "2027-01-15",
      submissionDate: "2027-01-17",
    });
    await db
      .update(schema.taskTable)
      .set({ releaseId: next.id })
      .where(eq(schema.taskTable.id, task.id));
    const stale = await ctx.call("POST", `${ctx.base(release.id)}/preview`, {
      timeZone: "UTC",
      changes: { moves: [{ taskId: task.id, target: { releaseId: next.id } }] },
    });
    expect([404, 409]).toContain(stale.status);
  });

  it("retains all drafts and rolls back a destination-name conflict introduced after preview", async () => {
    const ctx = await setup();
    const release = await ctx.release("Name collision");
    const task = await ctx.leaf(release.id);
    const changes: Changes = {
      newRelease: nextDraft,
      moves: [{ taskId: task.id, target: { draftKey: nextDraft.key } }],
    };
    const proposal = await ctx.preview(release.id, changes);
    await ctx.release(nextDraft.name, {
      startDate: nextDraft.startDate,
      codeFreezeDate: nextDraft.codeFreezeDate,
      submissionDate: nextDraft.submissionDate,
    });
    const response = await ctx.apply(release.id, proposal, changes);
    expect(response.status).toBe(409);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(2);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
    expect((await ctx.task(task.id))?.releaseId).toBe(release.id);
  });

  it("requires project-update and task-update permissions for draft previews and Apply", async () => {
    const ctx = await setup();
    const release = await ctx.release("Permissions");
    const task = await ctx.leaf(release.id);
    const changes: Changes = {
      newRelease: nextDraft,
      moves: [{ taskId: task.id, target: { draftKey: nextDraft.key } }],
    };
    const proposal = await ctx.preview(release.id, changes);
    await db
      .update(schema.workspaceUserTable)
      .set({ role: "member" })
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, ctx.workspace.id),
          eq(schema.workspaceUserTable.userId, ctx.user.id),
        ),
      );
    expect(
      (
        await ctx.call("POST", `${ctx.base(release.id)}/preview`, {
          timeZone: "UTC",
          changes,
        })
      ).status,
    ).toBe(403);
    expect((await ctx.apply(release.id, proposal, changes)).status).toBe(403);
    expect(await db.select().from(schema.releaseTable)).toHaveLength(1);
    await db
      .update(schema.workspaceUserTable)
      .set({ role: "owner" })
      .where(eq(schema.workspaceUserTable.userId, ctx.user.id));
    const key = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Missing task update",
        permissions: { task: ["read"], project: ["update"] },
      },
    });
    const denied = await ctx.app.request(
      `/api${ctx.base(release.id)}/preview`,
      jsonRequest(
        "POST",
        { timeZone: "UTC", changes },
        { "x-api-key": key.key },
      ),
    );
    expect(denied.status).toBe(403);
    const deniedApply = await ctx.app.request(
      `/api${ctx.base(release.id)}/apply`,
      jsonRequest(
        "POST",
        {
          asOf: proposal.asOf,
          revision: proposal.revision,
          generation: proposal.generation,
          timeZone: proposal.timeZone,
          changes,
        },
        { "x-api-key": key.key },
      ),
    );
    expect(deniedApply.status).toBe(403);
    await db
      .update(schema.workspaceUserTable)
      .set({ role: "admin" })
      .where(eq(schema.workspaceUserTable.userId, ctx.user.id));
    await restrictToProjects(ctx.workspace.id, ctx.user.id, []);
    expect([403, 404]).toContain(
      (await ctx.apply(release.id, proposal, changes)).status,
    );
  });
});
