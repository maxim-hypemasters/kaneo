import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { planEstimateDates } from "../../apps/api/src/agent/suggestions/plan-estimate-dates";
import db, { schema } from "../../apps/api/src/database";
import { ApiError } from "../../apps/api/src/errors/api-error";
import { updateTaskEstimatePlan } from "../../apps/api/src/task/controllers/update-task-estimate-plan";
import { createLinkedTestCases } from "../../apps/api/src/test-case/create-linked-test-cases";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { insertTask } from "./helpers/release/insert-task";
import { insertTimeOff } from "./helpers/time-off";

const publish = vi.hoisted(() =>
  vi.fn(async (_event: string, _data?: unknown) => undefined),
);
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/events")>()),
  publishEvent: publish,
}));

beforeEach(async () => {
  await resetTestDatabase();
  publish.mockClear();
});

const at = (iso: string) => new Date(iso);
const hours = (count: number) => count * 60;

async function setup() {
  const owner = await createWorkspaceMember({ role: "owner" });
  const workspaceId = owner.workspace.id;
  const { project } = await createProjectFixture({ workspaceId });
  const dev = await addWorkspaceMember(workspaceId);
  const task = await insertTask(project.id, { priority: "low" });
  const plan = (minutes: number, now: Date) =>
    planEstimateDates({
      workspaceId,
      assigneeId: dev.id,
      minutes,
      excludeTaskId: task.id,
      now,
    });
  return { ...owner, workspaceId, project, dev, task, plan };
}

const row = async (id: string) =>
  (
    await db.select().from(schema.taskTable).where(eq(schema.taskTable.id, id))
  )[0]!;

const published = (event: string) =>
  publish.mock.calls.filter(([name]) => name === event);

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("Expected a rejection");
}

describe("planEstimateDates", () => {
  it("lays the effort over weekdays from now", async () => {
    const ctx = await setup();
    // Friday 15:00: two hours, the weekend off, eight on Monday, six Tuesday.
    expect(await ctx.plan(hours(16), at("2027-01-08T15:00:00Z"))).toEqual({
      startDate: at("2027-01-08T15:00:00Z"),
      dueDate: at("2027-01-12T15:00:00Z"),
    });
  });

  it("works in the planning timezone", async () => {
    const ctx = await setup();
    // 08:00 in Berlin; the day starts at 09:00 local (08:00 UTC).
    expect(
      await planEstimateDates({
        workspaceId: ctx.workspaceId,
        assigneeId: ctx.dev.id,
        minutes: hours(8),
        timeZone: "Europe/Berlin",
        now: at("2027-01-11T07:00:00Z"),
      }),
    ).toEqual({
      startDate: at("2027-01-11T08:00:00Z"),
      dueDate: at("2027-01-11T16:00:00Z"),
    });
  });

  it("skips approved time off and public holidays, not pending requests", async () => {
    const ctx = await setup();
    await db.insert(schema.timeOffHolidayCalendarTable).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.dev.id,
      country: "DE",
    });
    await insertTimeOff({
      workspaceId: ctx.workspaceId,
      userId: ctx.dev.id,
      startDate: "2027-01-04",
      endDate: "2027-01-04",
      type: "sick",
      status: "approved",
    });
    await insertTimeOff({
      workspaceId: ctx.workspaceId,
      userId: ctx.dev.id,
      startDate: "2027-01-05",
      endDate: "2027-01-05",
      status: "pending",
    });
    // Thursday Dec 31, then New Year's Day (a holiday in Germany), the
    // weekend and the Monday off: the rest lands on Tuesday.
    expect(await ctx.plan(hours(16), at("2026-12-31T09:00:00Z"))).toEqual({
      startDate: at("2026-12-31T09:00:00Z"),
      dueDate: at("2027-01-05T17:00:00Z"),
    });
  });

  it("plans around the assignee's other open, dated work", async () => {
    const ctx = await setup();
    const other = await addWorkspaceMember(ctx.workspaceId);
    const wednesday = {
      startDate: at("2027-01-13T00:00:00Z"),
      dueDate: at("2027-01-14T00:00:00Z"),
    };
    // Planned for the developer all Monday, though assigned to someone else.
    await insertTask(ctx.project.id, {
      userId: other.id,
      scheduledAssigneeId: ctx.dev.id,
      startDate: at("2027-01-11T09:00:00Z"),
      dueDate: at("2027-01-11T17:00:00Z"),
      scheduleSegments: [
        { start: "2027-01-11T09:00:00.000Z", end: "2027-01-11T17:00:00.000Z" },
      ],
    });
    // A Bug with dates set by hand holds Tuesday morning.
    await insertTask(ctx.project.id, {
      type: "bug",
      userId: ctx.dev.id,
      startDate: at("2027-01-12T09:00:00Z"),
      dueDate: at("2027-01-12T13:00:00Z"),
    });
    // Nothing else holds Wednesday: done, archived, in Triage, due date
    // only, someone else's, the task itself, an archived project, another
    // workspace.
    await insertTask(ctx.project.id, {
      ...wednesday,
      userId: ctx.dev.id,
      status: "done",
    });
    await insertTask(ctx.project.id, {
      ...wednesday,
      userId: ctx.dev.id,
      status: "archived",
    });
    await insertTask(ctx.project.id, {
      ...wednesday,
      userId: ctx.dev.id,
      status: "triage",
    });
    await insertTask(ctx.project.id, {
      userId: ctx.dev.id,
      dueDate: wednesday.dueDate,
    });
    await insertTask(ctx.project.id, { ...wednesday, userId: other.id });
    await db
      .update(schema.taskTable)
      .set({ ...wednesday, userId: ctx.dev.id })
      .where(eq(schema.taskTable.id, ctx.task.id));
    const { project: shelved } = await createProjectFixture({
      workspaceId: ctx.workspaceId,
    });
    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, shelved.id));
    await insertTask(shelved.id, { ...wednesday, userId: ctx.dev.id });
    const elsewhere = await createWorkspaceMember();
    const { project: foreign } = await createProjectFixture({
      workspaceId: elsewhere.workspace.id,
    });
    await insertTask(foreign.id, { ...wednesday, userId: ctx.dev.id });

    // Monday 09:00: four hours on Tuesday afternoon, four on Wednesday.
    expect(await ctx.plan(hours(8), at("2027-01-11T09:00:00Z"))).toEqual({
      startDate: at("2027-01-12T13:00:00Z"),
      dueDate: at("2027-01-13T13:00:00Z"),
    });
  });

  it("returns null without effort or room within a year", async () => {
    const ctx = await setup();
    expect(await ctx.plan(0, at("2027-01-11T09:00:00Z"))).toBeNull();
    expect(
      await ctx.plan(hours(8 * 270), at("2027-01-11T09:00:00Z")),
    ).toBeNull();
  });
});

describe("updateTaskEstimatePlan", () => {
  it("sets the estimate and planned dates, dropping planned segments", async () => {
    const ctx = await setup();
    await db
      .update(schema.taskTable)
      .set({
        userId: ctx.dev.id,
        scheduledAssigneeId: ctx.dev.id,
        startDate: at("2027-01-04T09:00:00Z"),
        dueDate: at("2027-01-04T17:00:00Z"),
        scheduleSegments: [
          {
            start: "2027-01-04T09:00:00.000Z",
            end: "2027-01-04T17:00:00.000Z",
          },
        ],
      })
      .where(eq(schema.taskTable.id, ctx.task.id));
    const dates = await ctx.plan(hours(16), at("2027-01-08T15:00:00Z"));

    await updateTaskEstimatePlan({
      id: ctx.task.id,
      estimateSeconds: 16 * 3600,
      ...dates!,
      currentUserId: ctx.user.id,
    });

    expect(await row(ctx.task.id)).toMatchObject({
      estimateSeconds: 16 * 3600,
      startDate: at("2027-01-08T15:00:00Z"),
      dueDate: at("2027-01-12T15:00:00Z"),
      scheduleSegments: null,
    });
    expect(published("task.due_date_changed")).toHaveLength(1);
    expect(published("task.updated")[0]?.[1]).toMatchObject({
      taskId: ctx.task.id,
      projectId: ctx.project.id,
      userId: ctx.user.id,
    });
    expect(published("project-schedule.changed")).toHaveLength(1);
  });

  it("sets only the estimate when no dates are given", async () => {
    const ctx = await setup();
    const segments = [
      { start: "2027-01-04T09:00:00.000Z", end: "2027-01-04T17:00:00.000Z" },
    ];
    await db
      .update(schema.taskTable)
      .set({
        startDate: at("2027-01-04T09:00:00Z"),
        dueDate: at("2027-01-04T17:00:00Z"),
        scheduleSegments: segments,
      })
      .where(eq(schema.taskTable.id, ctx.task.id));

    await updateTaskEstimatePlan({
      id: ctx.task.id,
      estimateSeconds: 3600,
      currentUserId: ctx.user.id,
    });

    expect(await row(ctx.task.id)).toMatchObject({
      estimateSeconds: 3600,
      dueDate: at("2027-01-04T17:00:00Z"),
      scheduleSegments: segments,
    });
    expect(published("task.updated")).toHaveLength(1);
    expect(published("task.due_date_changed")).toHaveLength(0);
    expect(published("project-schedule.changed")).toHaveLength(0);

    // Nothing to change: nothing is announced.
    publish.mockClear();
    await updateTaskEstimatePlan({
      id: ctx.task.id,
      estimateSeconds: 3600,
      currentUserId: ctx.user.id,
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("refuses dates on a day the assignee is away", async () => {
    const ctx = await setup();
    await db
      .update(schema.taskTable)
      .set({ userId: ctx.dev.id })
      .where(eq(schema.taskTable.id, ctx.task.id));
    await insertTimeOff({
      workspaceId: ctx.workspaceId,
      userId: ctx.dev.id,
      startDate: "2027-01-12",
      endDate: "2027-01-12",
      status: "approved",
    });

    const error = await rejection(
      updateTaskEstimatePlan({
        id: ctx.task.id,
        estimateSeconds: 3600,
        startDate: at("2027-01-11T09:00:00Z"),
        dueDate: at("2027-01-12T10:00:00Z"),
        currentUserId: ctx.user.id,
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe("TASK_ASSIGNEE_AWAY");
    expect(await row(ctx.task.id)).toMatchObject({
      estimateSeconds: null,
      startDate: null,
      dueDate: null,
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("refuses Features, bad estimates and backwards dates", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const update = (
      values: Partial<Parameters<typeof updateTaskEstimatePlan>[0]>,
    ) =>
      rejection(
        updateTaskEstimatePlan({
          id: ctx.task.id,
          estimateSeconds: 3600,
          currentUserId: ctx.user.id,
          ...values,
        }),
      );
    expect((await update({ id: feature.id })).status).toBe(400);
    expect((await update({ estimateSeconds: 90 })).status).toBe(400);
    expect(
      (
        await update({
          startDate: at("2027-01-12T09:00:00Z"),
          dueDate: at("2027-01-11T09:00:00Z"),
        })
      ).status,
    ).toBe(400);
    expect((await update({ id: "missing" })).status).toBe(404);
    expect((await row(ctx.task.id)).estimateSeconds).toBeNull();
  });
});

describe("createLinkedTestCases", () => {
  async function testCaseSetup() {
    const ctx = await setup();
    const bug = await insertTask(ctx.project.id, { type: "bug" });
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const [milestone] = await db
      .insert(schema.milestoneTable)
      .values({ featureId: feature.id, title: "Beta" })
      .returning();
    const create = (
      link: Parameters<typeof createLinkedTestCases>[0]["link"],
      cases: Parameters<typeof createLinkedTestCases>[0]["cases"],
    ) =>
      createLinkedTestCases({
        projectId: ctx.project.id,
        workspaceId: ctx.workspaceId,
        link,
        cases,
        createdBy: ctx.user.id,
      });
    const stored = () =>
      db
        .select()
        .from(schema.testCaseTable)
        .orderBy(
          asc(schema.testCaseTable.createdAt),
          asc(schema.testCaseTable.id),
        );
    return { ...ctx, bug, milestone: milestone!, create, stored };
  }

  it("creates every case linked to the Bug, in order, without notifying mentions", async () => {
    const ctx = await testCaseSetup();
    const mention = `<kaneo-mention id="${ctx.dev.id}">Dev</kaneo-mention>`;
    const ids = await ctx.create({ bugId: ctx.bug.id }, [
      { title: "  Opens the form ", steps: `Ask ${mention}` },
      { title: "Saves", expectedResult: "Saved" },
      { title: "Cancels", steps: null, expectedResult: null },
    ]);

    const rows = await ctx.stored();
    expect(rows.map((testCase) => testCase.id)).toEqual(ids);
    expect(rows).toMatchObject([
      { title: "Opens the form", steps: `Ask ${mention}`, bugId: ctx.bug.id },
      { title: "Saves", expectedResult: "Saved", bugId: ctx.bug.id },
      { title: "Cancels", steps: null, milestoneId: null },
    ]);
    for (const testCase of rows)
      expect(testCase).toMatchObject({
        projectId: ctx.project.id,
        status: "not_run",
        createdBy: ctx.user.id,
      });
    expect(published("test-case.changed")).toEqual([
      [
        "test-case.changed",
        { projectId: ctx.project.id, testCaseId: ids[0], userId: ctx.user.id },
      ],
    ]);
    expect(await db.select().from(schema.notificationTable)).toEqual([]);
  });

  it("links cases to a milestone", async () => {
    const ctx = await testCaseSetup();
    await ctx.create({ milestoneId: ctx.milestone.id }, [
      { title: "One" },
      { title: "Two" },
    ]);
    expect(await ctx.stored()).toMatchObject([
      { title: "One", milestoneId: ctx.milestone.id, bugId: null },
      { title: "Two", milestoneId: ctx.milestone.id, bugId: null },
    ]);
  });

  it("creates none when any case or the link is refused", async () => {
    const ctx = await testCaseSetup();
    const elsewhere = await createProjectFixture({
      workspaceId: ctx.workspaceId,
    });
    const foreignBug = await insertTask(elsewhere.project.id, { type: "bug" });

    const refused = [
      await rejection(
        ctx.create({ bugId: ctx.bug.id }, [{ title: "Fine" }, { title: "  " }]),
      ),
      await rejection(ctx.create({ bugId: ctx.task.id }, [{ title: "Fine" }])),
      await rejection(
        ctx.create({ bugId: foreignBug.id }, [{ title: "Fine" }]),
      ),
      await rejection(
        ctx.create({ milestoneId: "missing" }, [{ title: "Fine" }]),
      ),
    ];
    expect(refused.map((error) => error.status)).toEqual([400, 400, 404, 404]);
    expect(await ctx.stored()).toEqual([]);
    expect(published("test-case.changed")).toEqual([]);
  });
});
