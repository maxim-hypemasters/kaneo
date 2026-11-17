import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";
import { addDays, insertTimeOff, mondayInWeeks } from "./helpers/time-off";
import { decideTimeOff, requestTimeOff } from "./helpers/time-off-planning";

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

const TUE = "2027-01-05T00:00:00.000Z";
const WED = "2027-01-06T00:00:00.000Z";
const THU = "2027-01-07T00:00:00.000Z";

// The owner edits tasks. `away` has approved sick leave (with a note) on
// Wednesday 2027-01-06 and a pending vacation on Thursday.
async function setup() {
  const owner = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: owner.workspace.id,
  });
  const away = await addWorkspaceMember(owner.workspace.id);
  const workspaceId = owner.workspace.id;
  await insertTimeOff({
    workspaceId,
    userId: away.id,
    startDate: "2027-01-06",
    endDate: "2027-01-06",
    type: "sick",
    status: "approved",
    note: "Surgery",
  });
  await insertTimeOff({
    workspaceId,
    userId: away.id,
    startDate: "2027-01-07",
    endDate: "2027-01-07",
    type: "vacation",
    status: "pending",
  });
  mockAuthenticatedSession(owner.user);
  const app = createApp().app;
  const call = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const task = (values: Parameters<typeof insertTask>[1] = {}) =>
    insertTask(project.id, { priority: "low", ...values });
  const setDue = (id: string, dueDate: string | null, timeZone?: string) =>
    call("PUT", `/task/due-date/${id}`, {
      dueDate,
      ...(timeZone ? { timeZone } : {}),
    });
  // A full update keeping everything the row has, plus `changes`.
  const update = async (id: string, changes: Record<string, unknown>) => {
    const current = await row(id);
    return call("PUT", `/task/${id}`, {
      title: current.title,
      status: current.status,
      priority: current.priority ?? "low",
      projectId: current.projectId,
      position: current.position ?? 0,
      ...changes,
    });
  };
  return {
    ...owner,
    workspaceId,
    project,
    away,
    call,
    task,
    setDue,
    update,
  };
}

const row = async (id: string) =>
  (
    await db.select().from(schema.taskTable).where(eq(schema.taskTable.id, id))
  )[0]!;

const published = (event: string) =>
  publish.mock.calls.filter(([name]) => name === event);

describe("a task date on a day its assignee is away", () => {
  it("refuses a due date on approved time off without saying why", async () => {
    const ctx = await setup();
    const task = await ctx.task({
      userId: ctx.away.id,
      dueDate: new Date(TUE),
    });

    const response = await ctx.setDue(task.id, WED, "UTC");
    expect(response.status).toBe(409);
    const body = await readErrorBody(response);
    expect(body.code).toBe("TASK_ASSIGNEE_AWAY");
    expect(body.message).toContain("2027-01-06");
    expect(body.issues?.[0]?.path).toBe(`tasks.${task.id}`);
    const text = JSON.stringify(body).toLowerCase();
    for (const word of ["sick", "surgery", "vacation", "holiday"])
      expect(text).not.toContain(word);
    expect((await row(task.id)).dueDate).toEqual(new Date(TUE));
  });

  it("never blocks on a pending request, or on away days a span crosses", async () => {
    const ctx = await setup();
    const pending = await ctx.task({ userId: ctx.away.id });
    expect((await ctx.setDue(pending.id, THU, "UTC")).status).toBe(200);

    const span = await ctx.task({ userId: ctx.away.id });
    const response = await ctx.update(span.id, {
      userId: ctx.away.id,
      startDate: TUE,
      dueDate: THU,
      timeZone: "UTC",
    });
    expect(response.status).toBe(200);
    expect(await row(span.id)).toMatchObject({
      startDate: new Date(TUE),
      dueDate: new Date(THU),
    });
  });

  it("reads the day in the sender's timezone, then the project's, then UTC", async () => {
    const ctx = await setup();
    // Midnight in Berlin starting Wednesday; still Tuesday in UTC.
    const berlinMidnight = "2027-01-05T23:00:00.000Z";
    const tasks = await Promise.all(
      [1, 2, 3, 4].map(() => ctx.task({ userId: ctx.away.id })),
    );
    expect(
      (await ctx.setDue(tasks[0]!.id, berlinMidnight, "Europe/Berlin")).status,
    ).toBe(409);
    expect((await ctx.setDue(tasks[1]!.id, berlinMidnight, "UTC")).status).toBe(
      200,
    );
    // No planning timezone yet: UTC.
    expect((await ctx.setDue(tasks[2]!.id, berlinMidnight)).status).toBe(200);
    await db
      .update(schema.projectTable)
      .set({ planningTimeZone: "Europe/Berlin" })
      .where(eq(schema.projectTable.id, ctx.project.id));
    expect((await ctx.setDue(tasks[3]!.id, berlinMidnight)).status).toBe(409);

    expect((await ctx.setDue(tasks[3]!.id, WED, "Mars/Base")).status).toBe(400);
  });

  it("checks both dates of hand-set work given to someone away, but not planned work", async () => {
    const ctx = await setup();
    const manual = await ctx.task({
      userId: ctx.user.id,
      dueDate: new Date(WED),
    });
    const refused = await ctx.call("PUT", `/task/assignee/${manual.id}`, {
      userId: ctx.away.id,
      timeZone: "UTC",
    });
    expect(refused.status).toBe(409);
    expect((await readErrorBody(refused)).code).toBe("TASK_ASSIGNEE_AWAY");
    expect((await row(manual.id)).userId).toBe(ctx.user.id);

    // Planned work keeps its planned assignee until the next Apply.
    const planned = await ctx.task({
      userId: ctx.user.id,
      startDate: new Date("2027-01-06T09:00:00Z"),
      dueDate: new Date("2027-01-06T17:00:00Z"),
      scheduledAssigneeId: ctx.user.id,
      scheduleSegments: [
        { start: "2027-01-06T09:00:00.000Z", end: "2027-01-06T17:00:00.000Z" },
      ],
    });
    expect(
      (
        await ctx.call("PUT", `/task/assignee/${planned.id}`, {
          userId: ctx.away.id,
        })
      ).status,
    ).toBe(200);
  });

  it("never checks a date again that a write leaves alone", async () => {
    const ctx = await setup();
    // Time off approved over a due date that was already set.
    const task = await ctx.task({
      userId: ctx.away.id,
      dueDate: new Date(WED),
    });
    expect(
      (await ctx.update(task.id, { title: "Renamed", userId: ctx.away.id }))
        .status,
    ).toBe(200);
    expect((await ctx.setDue(task.id, null)).status).toBe(200);

    const other = await ctx.task({
      userId: ctx.away.id,
      dueDate: new Date(WED),
    });
    expect(
      (await ctx.call("PUT", `/task/assignee/${other.id}`, { userId: null }))
        .status,
    ).toBe(200);
    expect((await row(other.id)).userId).toBeNull();
  });

  it("refuses a full update that hands work to someone away on its due day", async () => {
    const ctx = await setup();
    const task = await ctx.task({
      userId: ctx.user.id,
      dueDate: new Date(WED),
    });
    const refused = await ctx.update(task.id, {
      userId: ctx.away.id,
      timeZone: "UTC",
    });
    expect(refused.status).toBe(409);
    expect((await readErrorBody(refused)).code).toBe("TASK_ASSIGNEE_AWAY");
    expect((await row(task.id)).userId).toBe(ctx.user.id);

    // Omitting userId unassigns it, which never conflicts.
    expect((await ctx.update(task.id, {})).status).toBe(200);
    expect((await row(task.id)).userId).toBeNull();
  });

  it("refuses a bulk due date as a whole, with one issue per task", async () => {
    const ctx = await setup();
    const first = await ctx.task({ userId: ctx.away.id });
    const second = await ctx.task({
      userId: ctx.away.id,
      dueDate: new Date(TUE),
    });
    const free = await ctx.task({ userId: ctx.user.id });

    const response = await ctx.call("PATCH", "/task/bulk", {
      taskIds: [first.id, second.id, free.id],
      operation: "updateDueDate",
      value: WED,
      timeZone: "UTC",
    });
    expect(response.status).toBe(409);
    const body = await readErrorBody(response);
    expect(body.code).toBe("TASK_ASSIGNEE_AWAY");
    expect(body.issues?.map((issue) => issue.path).sort()).toEqual(
      [`tasks.${first.id}`, `tasks.${second.id}`].sort(),
    );
    expect((await row(first.id)).dueDate).toBeNull();
    expect((await row(second.id)).dueDate).toEqual(new Date(TUE));
    expect((await row(free.id)).dueDate).toBeNull();
    expect(published("task.due_date_changed")).toEqual([]);
  });

  it("refuses a bulk assignment as a whole when a dated task lands on a day away", async () => {
    const ctx = await setup();
    const dated = await ctx.task({
      userId: ctx.user.id,
      dueDate: new Date(WED),
    });
    const undated = await ctx.task({ userId: ctx.user.id });

    const response = await ctx.call("PATCH", "/task/bulk", {
      taskIds: [dated.id, undated.id],
      operation: "updateAssignee",
      value: ctx.away.id,
      timeZone: "UTC",
    });
    expect(response.status).toBe(409);
    expect((await readErrorBody(response)).issues).toEqual([
      {
        path: `tasks.${dated.id}`,
        message: expect.stringContaining("2027-01-06"),
      },
    ]);
    expect((await row(dated.id)).userId).toBe(ctx.user.id);
    expect((await row(undated.id)).userId).toBe(ctx.user.id);
    expect(published("task.assignee_changed")).toEqual([]);
  });

  it("blocks the public holidays of the assignee's calendar without naming them", async () => {
    const ctx = await setup();
    await db.insert(schema.timeOffHolidayCalendarTable).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.away.id,
      country: "DE",
    });
    const newYear = "2027-01-01T00:00:00.000Z";
    const task = await ctx.task({ userId: ctx.away.id });
    const response = await ctx.setDue(task.id, newYear, "UTC");
    expect(response.status).toBe(409);
    const body = await readErrorBody(response);
    expect(body.code).toBe("TASK_ASSIGNEE_AWAY");
    const text = JSON.stringify(body).toLowerCase();
    for (const word of ["neujahr", "new year", "holiday"])
      expect(text).not.toContain(word);

    // Someone without a calendar works that day.
    const free = await ctx.task({ userId: ctx.user.id });
    expect((await ctx.setDue(free.id, newYear, "UTC")).status).toBe(200);
  });

  it("blocks a public holiday request only once it is approved", async () => {
    const ctx = await setup();
    const member = await addWorkspaceMember(ctx.workspaceId);
    // A Tuesday a few weeks ahead, inside the time off request window.
    const day = addDays(mondayInWeeks(3), 1);
    const due = `${day}T00:00:00.000Z`;
    const request = await requestTimeOff(ctx.call, ctx.workspaceId, {
      startDate: day,
      type: "public_holiday",
      userId: member.id,
    });

    const before = await ctx.task({ userId: member.id });
    expect((await ctx.setDue(before.id, due, "UTC")).status).toBe(200);

    await decideTimeOff(ctx.call, request, "approve");
    const after = await ctx.task({ userId: member.id });
    const refused = await ctx.setDue(after.id, due, "UTC");
    expect(refused.status).toBe(409);
    expect((await readErrorBody(refused)).code).toBe("TASK_ASSIGNEE_AWAY");
  });
});
