import { and, eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
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

beforeEach(resetTestDatabase);
afterEach(() => vi.useRealTimers());

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
  const release = async (name: string) => {
    const [row] = await db
      .insert(schema.releaseTable)
      .values({
        projectId: fixture.project.id,
        name,
        startDate: "2027-01-04",
        codeFreezeDate: "2027-01-08",
        submissionDate: "2027-01-10",
      })
      .returning();
    return row!;
  };
  const base = (releaseId: string) =>
    `/project-schedule/${fixture.project.id}/release/${releaseId}`;
  const preview = async (releaseId: string, timeZone = "UTC") => {
    const response = await call("POST", `${base(releaseId)}/preview`, {
      timeZone,
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
    },
  ) =>
    call("POST", `${base(releaseId)}/apply`, {
      asOf: proposal.asOf,
      revision: proposal.revision,
      generation: proposal.generation,
      timeZone: proposal.timeZone,
    });
  const leaf = (
    releaseId: string | null,
    values: Partial<typeof schema.taskTable.$inferInsert> = {},
  ) =>
    insertTask(fixture.project.id, {
      userId: member.user.id,
      estimateSeconds: 7200,
      releaseId,
      ...values,
    });
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
  };
}

describe("release-scoped effort planning", () => {
  it("previews and applies the full current workday in the project timezone", async () => {
    const asOf = "2027-01-06T00:30:00.000Z";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(asOf));
    const ctx = await setup();
    const release = await ctx.release("Full workday");
    await db
      .update(schema.projectTable)
      .set({ planningTimeZone: "America/Los_Angeles" })
      .where(eq(schema.projectTable.id, ctx.project.id));
    const task = await ctx.leaf(release.id, { estimateSeconds: 4 * 3600 });

    // The preview runs at 16:30 on January 5 in the project's timezone.
    const preview = await ctx.preview(release.id, "UTC");
    const start = "2027-01-05T17:00:00.000Z";
    const end = "2027-01-05T21:00:00.000Z";
    const placement = {
      taskId: task.id,
      start,
      end,
      segments: [{ start, end }],
    };
    expect(preview).toMatchObject({
      asOf,
      planFrom: "2027-01-05T08:00:00.000Z",
      timeZone: "America/Los_Angeles",
      tasks: [placement],
    });
    const applied = await ctx.apply(release.id, preview);
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({
      planned: true,
      outdated: false,
      tasks: [placement],
    });
  });

  it("captures release dates with the proposal and requires a new preview after date edits", async () => {
    const ctx = await setup();
    const release = await ctx.release("Snapshot boundaries");
    const task = await ctx.leaf(release.id);
    const originalDates = {
      startDate: release.startDate,
      codeFreezeDate: release.codeFreezeDate,
      submissionDate: release.submissionDate,
    };
    const reviewed = await ctx.preview(release.id);
    expect(reviewed.releaseDates).toEqual(originalDates);
    expect(reviewed.tasks[0]).toMatchObject({
      taskId: task.id,
      start: "2027-01-04T09:00:00.000Z",
    });
    const editedDates = {
      startDate: "2027-01-11",
      codeFreezeDate: "2027-01-15",
      submissionDate: "2027-01-17",
    };
    expect(
      (await ctx.call("PUT", `/release/${release.id}`, editedDates)).status,
    ).toBe(200);
    expect((await ctx.apply(release.id, reviewed)).status).toBe(409);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, task.id),
        })
      )?.startDate,
    ).toBeNull();
    expect(reviewed.releaseDates).toEqual(originalDates);
    const refreshed = await ctx.preview(release.id);
    expect(refreshed.releaseDates).toEqual(editedDates);
    expect(refreshed.tasks[0]).toMatchObject({
      taskId: task.id,
      start: "2027-01-11T09:00:00.000Z",
    });
    expect(refreshed.revision).not.toBe(reviewed.revision);
    expect((await ctx.apply(release.id, refreshed)).status).toBe(200);
  });

  it("reports completion from final workflow columns in read and preview rows", async () => {
    const ctx = await setup();
    const release = await ctx.release("Workflow completion");
    await db.insert(schema.columnTable).values({
      projectId: ctx.project.id,
      name: "Shipped",
      slug: "shipped",
      position: 9,
      isFinal: true,
    });
    await db
      .update(schema.columnTable)
      .set({ isFinal: false })
      .where(eq(schema.columnTable.id, ctx.columns.done.id));
    const finished = await ctx.leaf(release.id, {
      status: "shipped",
      startDate: new Date("2026-10-01T09:00:00Z"),
      dueDate: new Date("2026-10-01T11:00:00Z"),
    });
    const unfinishedBug = await ctx.leaf(release.id, {
      type: "bug",
      status: "done",
    });
    const archived = await ctx.leaf(release.id, { status: "archived" });
    const current = await (await ctx.call("GET", ctx.base(release.id))).json();
    const preview = await ctx.preview(release.id);
    for (const response of [current, preview]) {
      expect(
        response.tasks.find(
          (row: { taskId: string }) => row.taskId === finished.id,
        ),
      ).toMatchObject({ completed: true, end: "2026-10-01T11:00:00.000Z" });
      expect(
        response.tasks.find(
          (row: { taskId: string }) => row.taskId === unfinishedBug.id,
        ),
      ).toMatchObject({ completed: false, type: "bug" });
      expect(
        response.tasks.find(
          (row: { taskId: string }) => row.taskId === archived.id,
        ),
      ).toMatchObject({ completed: false });
    }
    expect(preview.scheduledCount).toBe(1);
    expect((await ctx.apply(release.id, preview)).status).toBe(200);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, finished.id),
        })
      )?.dueDate,
    ).toEqual(finished.dueDate);
  });

  it("returns preview dependency pairs only when both tasks are in the release snapshot", async () => {
    const ctx = await setup("admin");
    const selected = await ctx.release("Visible dependencies");
    const other = await ctx.release("Other release");
    const completed = await ctx.leaf(selected.id, { status: "done" });
    const first = await ctx.leaf(selected.id);
    const second = await ctx.leaf(selected.id, { type: "bug" });
    const nonselected = await ctx.leaf(other.id);
    const external = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const hidden = await insertTask(external.project.id, {
      title: "Private blocker title",
    });
    await db.insert(schema.taskRelationTable).values([
      {
        sourceTaskId: completed.id,
        targetTaskId: first.id,
        relationType: "blocks",
      },
      {
        sourceTaskId: first.id,
        targetTaskId: second.id,
        relationType: "blocks",
      },
      {
        sourceTaskId: nonselected.id,
        targetTaskId: first.id,
        relationType: "blocks",
      },
      {
        sourceTaskId: hidden.id,
        targetTaskId: second.id,
        relationType: "blocks",
      },
      {
        sourceTaskId: second.id,
        targetTaskId: nonselected.id,
        relationType: "blocks",
      },
      {
        sourceTaskId: completed.id,
        targetTaskId: second.id,
        relationType: "related",
      },
    ]);
    await restrictToProjects(ctx.workspace.id, ctx.user.id, [ctx.project.id]);
    const preview = await ctx.preview(selected.id);
    expect(preview.dependencies).toHaveLength(2);
    expect(preview.dependencies).toEqual(
      expect.arrayContaining([
        { blockerId: completed.id, blockedId: first.id },
        { blockerId: first.id, blockedId: second.id },
      ]),
    );
    const visible = new Set(
      preview.tasks.map((row: { taskId: string }) => row.taskId),
    );
    for (const edge of preview.dependencies) {
      expect(visible.has(edge.blockerId)).toBe(true);
      expect(visible.has(edge.blockedId)).toBe(true);
    }
    expect(JSON.stringify(preview)).not.toContain(hidden.id);
    expect(JSON.stringify(preview)).not.toContain(hidden.title);
    expect(JSON.stringify(preview)).not.toContain(nonselected.id);
    expect(await ctx.preview(other.id)).toMatchObject({ dependencies: [] });
  });

  it("returns current priority and rejects a reviewed preview after the narrow priority update", async () => {
    const ctx = await setup();
    const release = await ctx.release("Editable priorities");
    const task = await ctx.leaf(release.id, { priority: "low" });
    const bug = await ctx.leaf(release.id, { type: "bug", priority: "high" });
    const current = await (await ctx.call("GET", ctx.base(release.id))).json();
    expect(
      current.tasks.find((row: { taskId: string }) => row.taskId === task.id),
    ).toMatchObject({ priority: "low" });
    expect(
      current.tasks.find((row: { taskId: string }) => row.taskId === bug.id),
    ).toMatchObject({ priority: "high", type: "bug" });
    const reviewed = await ctx.preview(release.id);
    expect(
      reviewed.tasks.find((row: { taskId: string }) => row.taskId === bug.id),
    ).toMatchObject({ priority: "high", start: "2027-01-04T09:00:00.000Z" });
    expect(
      (
        await ctx.call("PUT", `/task/priority/${task.id}`, {
          priority: "urgent",
        })
      ).status,
    ).toBe(200);
    expect((await ctx.apply(release.id, reviewed)).status).toBe(409);
    const updated = await (await ctx.call("GET", ctx.base(release.id))).json();
    expect(
      updated.tasks.find((row: { taskId: string }) => row.taskId === task.id),
    ).toMatchObject({ priority: "urgent", currentStart: null });
    const recalculated = await ctx.preview(release.id);
    expect(
      recalculated.tasks.find(
        (row: { taskId: string }) => row.taskId === task.id,
      ),
    ).toMatchObject({ priority: "urgent", start: "2027-01-04T09:00:00.000Z" });
    expect(
      recalculated.tasks.find(
        (row: { taskId: string }) => row.taskId === bug.id,
      ),
    ).toMatchObject({ priority: "high", start: "2027-01-04T11:00:00.000Z" });
  });

  it("returns the current canonical total estimate, including null, in read and preview rows", async () => {
    const ctx = await setup();
    const release = await ctx.release("Editable estimates");
    const task = await ctx.leaf(release.id, { estimateSeconds: 14400 });
    const bug = await ctx.leaf(release.id, {
      type: "bug",
      estimateSeconds: null,
    });
    await db.insert(schema.timeEntryTable).values({
      taskId: task.id,
      userId: ctx.user.id,
      startTime: new Date("2026-10-01T09:00:00Z"),
      endTime: new Date("2026-10-01T10:00:00Z"),
      duration: 3600,
    });
    const current = await (await ctx.call("GET", ctx.base(release.id))).json();
    expect(
      current.tasks.find((row: { taskId: string }) => row.taskId === task.id),
    ).toMatchObject({ estimateSeconds: 14400, currentAssigneeId: ctx.user.id });
    expect(
      current.tasks.find((row: { taskId: string }) => row.taskId === bug.id),
    ).toMatchObject({ estimateSeconds: null, type: "bug" });
    const proposal = await ctx.preview(release.id);
    expect(
      proposal.tasks.find((row: { taskId: string }) => row.taskId === task.id),
    ).toMatchObject({
      estimateSeconds: 14400,
      start: "2027-01-04T09:00:00.000Z",
      end: "2027-01-04T12:00:00.000Z",
    });
    expect(
      proposal.tasks.find((row: { taskId: string }) => row.taskId === bug.id),
    ).toMatchObject({ estimateSeconds: null, reason: "no_estimate" });
    expect(
      (
        await ctx.call("PATCH", "/task/bulk", {
          taskIds: [task.id],
          operation: "updateEstimate",
          value: "18000",
        })
      ).status,
    ).toBe(200);
    expect((await ctx.apply(release.id, proposal)).status).toBe(409);
    const reestimated = await ctx.preview(release.id);
    expect(
      reestimated.tasks.find(
        (row: { taskId: string }) => row.taskId === task.id,
      ),
    ).toMatchObject({
      estimateSeconds: 18000,
      end: "2027-01-04T13:00:00.000Z",
    });
    expect(
      (await ctx.call("PUT", `/task/assignee/${task.id}`, { userId: null }))
        .status,
    ).toBe(200);
    expect((await ctx.apply(release.id, reestimated)).status).toBe(409);
    const unassigned = await ctx.preview(release.id);
    expect(
      unassigned.tasks.find(
        (row: { taskId: string }) => row.taskId === task.id,
      ),
    ).toMatchObject({
      estimateSeconds: 18000,
      currentAssigneeId: null,
      reason: "unassigned",
    });
    const readOnlyKey = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "No estimate write scope",
        permissions: { task: ["read"], project: ["update"] },
      },
    });
    const denied = await ctx.app.request("/api/task/bulk", {
      ...jsonRequest("PATCH", {
        taskIds: [task.id],
        operation: "updateEstimate",
        value: "21600",
      }),
      headers: {
        "content-type": "application/json",
        "x-api-key": readOnlyKey.key,
      },
    });
    expect(denied.status).toBe(403);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, task.id),
        })
      )?.estimateSeconds,
    ).toBe(18000);
  });

  it("retains deleted release planning history without leaving a permanent project stale flag", async () => {
    const ctx = await setup();
    const release = await ctx.release("Empty planned release");
    expect(
      (await ctx.apply(release.id, await ctx.preview(release.id))).status,
    ).toBe(200);
    await db
      .delete(schema.releaseTable)
      .where(eq(schema.releaseTable.id, release.id));
    expect((await db.select().from(schema.projectPlanTable))[0]).toMatchObject({
      releaseId: null,
      generation: 1,
    });
    expect(
      await (
        await ctx.call("GET", `/project-schedule/${ctx.project.id}`)
      ).json(),
    ).toMatchObject({ generation: 1, outdated: false, tasks: [] });
  });

  it("reconciles reminders only for selected tasks whose applied finish changed", async () => {
    const ctx = await setup();
    const selected = await ctx.release("Selected");
    const other = await ctx.release("Other");
    const task = await ctx.leaf(selected.id);
    const untouched = await ctx.leaf(other.id);
    expect(
      (await ctx.apply(selected.id, await ctx.preview(selected.id))).status,
    ).toBe(200);
    await db.insert(schema.taskReminderSentTable).values([
      { taskId: task.id, reminderType: "configured_before" },
      { taskId: untouched.id, reminderType: "configured_before" },
    ]);
    await db
      .update(schema.taskTable)
      .set({ estimateSeconds: 10800 })
      .where(eq(schema.taskTable.id, task.id));
    expect(
      (await ctx.apply(selected.id, await ctx.preview(selected.id))).status,
    ).toBe(200);
    expect(
      (await db.select().from(schema.taskReminderSentTable)).map(
        (row) => row.taskId,
      ),
    ).toEqual([untouched.id]);
    await db
      .insert(schema.taskReminderSentTable)
      .values({ taskId: task.id, reminderType: "configured_before" });
    expect(
      (await ctx.apply(selected.id, await ctx.preview(selected.id))).status,
    ).toBe(200);
    expect(
      (await db.select().from(schema.taskReminderSentTable))
        .map((row) => row.taskId)
        .sort(),
    ).toEqual([task.id, untouched.id].sort());
  });

  it("plans only selected-release Tasks/Bugs with default weekdays and no member setup", async () => {
    const ctx = await setup();
    const release = await ctx.release("Selected");
    const other = await ctx.release("Other");
    const task = await ctx.leaf(release.id, {
      title: "Selected task",
      priority: "urgent",
    });
    const bug = await ctx.leaf(release.id, {
      title: "Selected bug",
      type: "bug",
      estimateSeconds: 3600,
    });
    const unrelated = await ctx.leaf(other.id, {
      startDate: new Date("2027-02-01T09:00:00Z"),
      dueDate: new Date("2027-02-01T17:00:00Z"),
      legacyDueDate: new Date("2027-02-01T17:00:00Z"),
    });
    await ctx.leaf(null);
    const before = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, unrelated.id),
    });
    const proposal = await ctx.preview(release.id);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, task.id),
        })
      )?.startDate,
    ).toBeNull();
    expect(proposal.scheduledCount).toBe(2);
    expect(proposal.planFrom).toBe("2027-01-04T00:00:00.000Z");
    expect(
      proposal.tasks.map((item: { taskId: string }) => item.taskId).sort(),
    ).toEqual([task.id, bug.id].sort());
    expect(
      proposal.tasks.find(
        (item: { taskId: string }) => item.taskId === task.id,
      ),
    ).toMatchObject({
      title: "Selected task",
      identifier: `${ctx.project.slug.toUpperCase()}-${task.number}`,
      type: "task",
      assigneeName: ctx.user.name,
      currentStart: null,
      start: "2027-01-04T09:00:00.000Z",
      end: "2027-01-04T11:00:00.000Z",
      changed: true,
    });
    expect((await ctx.apply(release.id, proposal)).status).toBe(200);
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, unrelated.id),
      }),
    ).toEqual(before);
    const global = await (
      await ctx.call("GET", `/project-schedule/${ctx.project.id}`)
    ).json();
    expect(global.outdated).toBe(false);
    expect(
      global.tasks.find(
        (item: { taskId: string }) => item.taskId === unrelated.id,
      ),
    ).toMatchObject({
      start: "2027-02-01T09:00:00.000Z",
      end: "2027-02-01T17:00:00.000Z",
      assigneeId: ctx.user.id,
    });
    const own = await (await ctx.call("GET", ctx.base(release.id))).json();
    expect(own).toMatchObject({
      planned: true,
      outdated: false,
      generation: 1,
    });
    expect(own.tasks.every((item: { changed: boolean }) => !item.changed)).toBe(
      true,
    );
    expect(
      await (await ctx.call("GET", ctx.base(other.id))).json(),
    ).toMatchObject({ planned: false, appliedAt: null, outdated: false });
    expect((await ctx.preview(release.id)).changedCount).toBe(0);
  });

  it("ignores member calendar overrides, fixes eight-hour weekdays, and binds the first timezone", async () => {
    const ctx = await setup();
    const release = await ctx.release("Timezone");
    await db.insert(schema.workCalendarTable).values({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      timeZone: "Asia/Tokyo",
      weeklyIntervals: [{ weekday: 6, startMinute: 0, endMinute: 60 }],
      timeOff: [{ start: "2027-01-04T00:00:00Z", end: "2027-01-20T00:00:00Z" }],
    });
    await db
      .update(schema.projectTable)
      .set({ estimateDayMinutes: 120 })
      .where(eq(schema.projectTable.id, ctx.project.id));
    const task = await ctx.leaf(release.id, { estimateSeconds: 10 * 3600 });
    const proposal = await ctx.preview(release.id, "America/New_York");
    expect(proposal.timeZone).toBe("America/New_York");
    expect(proposal.tasks[0]).toMatchObject({
      taskId: task.id,
      start: "2027-01-04T14:00:00.000Z",
      end: "2027-01-05T16:00:00.000Z",
      segments: [
        { start: "2027-01-04T14:00:00.000Z", end: "2027-01-04T22:00:00.000Z" },
        { start: "2027-01-05T14:00:00.000Z", end: "2027-01-05T16:00:00.000Z" },
      ],
    });
    expect(
      (
        await db.query.projectTable.findFirst({
          where: eq(schema.projectTable.id, ctx.project.id),
        })
      )?.planningTimeZone,
    ).toBeNull();
    expect(
      (await ctx.apply(release.id, { ...proposal, timeZone: "UTC" })).status,
    ).toBe(409);
    expect((await ctx.apply(release.id, proposal)).status).toBe(200);
    expect(
      (
        await db.query.projectTable.findFirst({
          where: eq(schema.projectTable.id, ctx.project.id),
        })
      )?.planningTimeZone,
    ).toBe("America/New_York");
    const repeated = await ctx.preview(release.id, "Asia/Tokyo");
    expect(repeated.timeZone).toBe("America/New_York");
    expect(repeated.changedCount).toBe(0);
    expect(
      await (await ctx.call("GET", ctx.base(release.id))).json(),
    ).toMatchObject({
      settings: { timeZone: "America/New_York", estimateDayMinutes: 480 },
      outdated: false,
    });
  });

  it("reserves another release's published work while preserving its placement and own planning metadata", async () => {
    const ctx = await setup();
    const first = await ctx.release("First");
    const second = await ctx.release("Second");
    const empty = await ctx.release("Empty");
    const reserved = await ctx.leaf(first.id, { estimateSeconds: 4 * 3600 });
    const planned = await ctx.leaf(second.id, { estimateSeconds: 6 * 3600 });
    expect(
      (await ctx.apply(first.id, await ctx.preview(first.id))).status,
    ).toBe(200);
    const before = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, reserved.id),
    });
    const proposal = await ctx.preview(second.id);
    expect(proposal.tasks[0]).toMatchObject({
      taskId: planned.id,
      start: "2027-01-04T13:00:00.000Z",
      end: "2027-01-05T11:00:00.000Z",
    });
    expect((await ctx.apply(second.id, proposal)).status).toBe(200);
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, reserved.id),
      }),
    ).toEqual(before);
    expect(
      await (await ctx.call("GET", ctx.base(first.id))).json(),
    ).toMatchObject({ planned: true, outdated: true });
    expect(
      await (await ctx.call("GET", ctx.base(second.id))).json(),
    ).toMatchObject({ planned: true, outdated: false });
    expect(
      await (
        await ctx.call("GET", `/project-schedule/${ctx.project.id}`)
      ).json(),
    ).toMatchObject({ outdated: true });
    expect(
      await (await ctx.call("GET", ctx.base(empty.id))).json(),
    ).toMatchObject({ planned: false, appliedAt: null });
    expect(
      (await ctx.apply(empty.id, await ctx.preview(empty.id))).status,
    ).toBe(200);
    expect(
      await (await ctx.call("GET", ctx.base(second.id))).json(),
    ).toMatchObject({ planned: true, outdated: false });
    expect(
      (await ctx.apply(first.id, await ctx.preview(first.id))).status,
    ).toBe(200);
    expect(
      await (
        await ctx.call("GET", `/project-schedule/${ctx.project.id}`)
      ).json(),
    ).toMatchObject({ outdated: false });
    expect(
      (await db.select().from(schema.projectPlanTable))
        .map((row) => row.releaseId)
        .sort(),
    ).toEqual([first.id, first.id, second.id, empty.id].sort());
  });

  it("uses nonselected same-project blockers' applied finish without replanning them", async () => {
    const ctx = await setup();
    const source = await ctx.release("Dependency source");
    const target = await ctx.release("Dependency target");
    const blocker = await ctx.leaf(source.id, { estimateSeconds: 4 * 3600 });
    const dependent = await ctx.leaf(target.id);
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: blocker.id,
      targetTaskId: dependent.id,
      relationType: "blocks",
    });
    expect((await ctx.preview(target.id)).diagnostics).toContainEqual({
      taskId: dependent.id,
      reason: "external_dependency_unavailable",
    });
    expect(
      (await ctx.apply(source.id, await ctx.preview(source.id))).status,
    ).toBe(200);
    const proposal = await ctx.preview(target.id);
    expect(proposal.tasks[0]).toMatchObject({
      taskId: dependent.id,
      start: "2027-01-04T13:00:00.000Z",
      end: "2027-01-04T15:00:00.000Z",
    });
    expect(
      proposal.tasks.some(
        (row: { taskId: string }) => row.taskId === blocker.id,
      ),
    ).toBe(false);
  });

  it("rechecks the complete project and allows only one concurrent Apply", async () => {
    const ctx = await setup();
    const selected = await ctx.release("Selected");
    const other = await ctx.release("Other");
    const task = await ctx.leaf(selected.id);
    const unrelated = await ctx.leaf(other.id);
    const stale = await ctx.preview(selected.id);
    await db
      .update(schema.taskTable)
      .set({ priority: "urgent" })
      .where(eq(schema.taskTable.id, unrelated.id));
    expect((await ctx.apply(selected.id, stale)).status).toBe(409);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, task.id),
        })
      )?.startDate,
    ).toBeNull();
    const proposal = await ctx.preview(selected.id);
    const responses = await Promise.all([
      ctx.apply(selected.id, proposal),
      ctx.apply(selected.id, proposal),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(1);
  });

  it("preserves completed dates and clears only selected unfinished legacy timing on Apply", async () => {
    const ctx = await setup();
    const selected = await ctx.release("Selected");
    const other = await ctx.release("Other");
    const old = new Date("2026-10-01T09:00:00Z");
    const done = await ctx.leaf(selected.id, {
      status: "done",
      startDate: old,
      dueDate: old,
      estimateSeconds: null,
    });
    const unestimated = await ctx.leaf(selected.id, {
      startDate: old,
      dueDate: old,
      legacyDueDate: old,
      estimateSeconds: null,
    });
    const archived = await ctx.leaf(selected.id, {
      status: "archived",
      startDate: old,
      dueDate: old,
      legacyDueDate: old,
      estimateSeconds: null,
    });
    const untouched = await ctx.leaf(other.id, {
      startDate: old,
      dueDate: old,
      estimateSeconds: null,
    });
    const preview = await ctx.preview(selected.id);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, unestimated.id),
        })
      )?.dueDate,
    ).toEqual(old);
    expect((await ctx.apply(selected.id, preview)).status).toBe(200);
    for (const id of [done.id, untouched.id])
      expect(
        (
          await db.query.taskTable.findFirst({
            where: eq(schema.taskTable.id, id),
          })
        )?.dueDate,
      ).toEqual(old);
    for (const id of [unestimated.id, archived.id])
      expect(
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, id),
        }),
      ).toMatchObject({ startDate: null, dueDate: null, legacyDueDate: old });
  });

  it("enforces project/release isolation, scopes, and rejects a supplied planning start", async () => {
    const ctx = await setup();
    const release = await ctx.release("Scoped");
    expect(
      (
        await ctx.call("POST", `${ctx.base(release.id)}/preview`, {
          planFrom: "2027-02-01T09:00:00Z",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx.call("POST", `${ctx.base(release.id)}/preview`, {
          timeZone: "Invalid/Zone",
        })
      ).status,
    ).toBe(400);
    const another = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const [foreignRelease] = await db
      .insert(schema.releaseTable)
      .values({
        projectId: another.project.id,
        name: "Another",
        startDate: "2027-01-04",
        codeFreezeDate: "2027-01-08",
        submissionDate: "2027-01-10",
      })
      .returning();
    expect((await ctx.call("GET", ctx.base(foreignRelease!.id))).status).toBe(
      404,
    );
    const foreign = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(foreign.user);
    expect([403, 404]).toContain(
      (await ctx.call("GET", ctx.base(release.id))).status,
    );
    mockAuthenticatedSession(ctx.user);
    const key = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Read release planning",
        permissions: { task: ["read", "update"] },
      },
    });
    const response = await ctx.app.request(
      `/api${ctx.base(release.id)}/preview`,
      {
        ...jsonRequest("POST", {}),
        headers: { "content-type": "application/json", "x-api-key": key.key },
      },
    );
    expect(response.status).toBe(403);
    await db
      .update(schema.workspaceUserTable)
      .set({ role: "member" })
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, ctx.workspace.id),
          eq(schema.workspaceUserTable.userId, ctx.user.id),
        ),
      );
    expect((await ctx.call("GET", ctx.base(release.id))).status).toBe(200);
    expect(
      (await ctx.call("POST", `${ctx.base(release.id)}/preview`, {})).status,
    ).toBe(403);
  });
});
