import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
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

beforeEach(resetTestDatabase);

async function setup(role = "owner") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  await db
    .update(schema.projectTable)
    .set({ planningTimeZone: "UTC" })
    .where(eq(schema.projectTable.id, fixture.project.id));
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const call = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const move = (id: string, start: string, end: string) =>
    call("PUT", `/task/schedule/${id}`, { start, end });
  return { ...member, ...fixture, call, move };
}

const row = async (id: string) =>
  (
    await db.select().from(schema.taskTable).where(eq(schema.taskTable.id, id))
  )[0]!;

describe("moving work on the schedule", () => {
  it("lays planned work out again through working hours and keeps its planned assignee", async () => {
    const ctx = await setup();
    // Monday 13:00–17:00 and Tuesday 09:00–13:00 UTC: eight hours.
    const task = await insertTask(ctx.project.id, {
      userId: ctx.user.id,
      estimateSeconds: 28_800,
      startDate: new Date("2027-01-04T13:00:00Z"),
      dueDate: new Date("2027-01-05T13:00:00Z"),
      scheduledAssigneeId: ctx.user.id,
      scheduleSegments: [
        { start: "2027-01-04T13:00:00.000Z", end: "2027-01-04T17:00:00.000Z" },
        { start: "2027-01-05T09:00:00.000Z", end: "2027-01-05T13:00:00.000Z" },
      ],
    });
    await db
      .insert(schema.taskReminderSentTable)
      .values({ taskId: task.id, reminderType: "due_soon" });

    // Dropped on Friday afternoon: the rest runs on Monday morning.
    const response = await ctx.move(
      task.id,
      "2027-01-08T13:00:00.000Z",
      "2027-01-09T13:00:00.000Z",
    );
    expect(response.status).toBe(200);
    expect((await response.json()).dueDate).toBe("2027-01-11T13:00:00.000Z");

    const moved = await row(task.id);
    expect(moved.startDate).toEqual(new Date("2027-01-08T13:00:00Z"));
    expect(moved.dueDate).toEqual(new Date("2027-01-11T13:00:00Z"));
    expect(moved.scheduleSegments).toEqual([
      { start: "2027-01-08T13:00:00.000Z", end: "2027-01-08T17:00:00.000Z" },
      { start: "2027-01-11T09:00:00.000Z", end: "2027-01-11T13:00:00.000Z" },
    ]);
    expect(moved.scheduledAssigneeId).toBe(ctx.user.id);
    expect(
      await db
        .select()
        .from(schema.taskReminderSentTable)
        .where(eq(schema.taskReminderSentTable.taskId, task.id)),
    ).toEqual([]);
  });

  it("moves unplanned work on the date fields it already has", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, {
      dueDate: new Date("2027-01-04T00:00:00Z"),
    });
    const response = await ctx.move(
      task.id,
      "2027-01-06T00:00:00.000Z",
      "2027-01-06T00:00:00.000Z",
    );
    expect(response.status).toBe(200);
    const moved = await row(task.id);
    expect(moved.startDate).toBeNull();
    expect(moved.dueDate).toEqual(new Date("2027-01-06T00:00:00Z"));
    expect(moved.scheduleSegments).toBeNull();
  });

  it("rejects Features, unscheduled work and reversed spans", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const unscheduled = await insertTask(ctx.project.id);
    const dated = await insertTask(ctx.project.id, {
      dueDate: new Date("2027-01-04T00:00:00Z"),
    });
    const span = ["2027-01-06T00:00:00.000Z", "2027-01-07T00:00:00.000Z"];
    expect((await ctx.move(feature.id, span[0]!, span[1]!)).status).toBe(400);
    expect((await ctx.move(unscheduled.id, span[0]!, span[1]!)).status).toBe(
      400,
    );
    expect((await ctx.move(dated.id, span[1]!, span[0]!)).status).toBe(400);
    expect((await row(dated.id)).dueDate).toEqual(
      new Date("2027-01-04T00:00:00Z"),
    );
  });

  it("needs task:update permission and hides other workspaces' work", async () => {
    const ctx = await setup("viewer");
    const task = await insertTask(ctx.project.id, {
      dueDate: new Date("2027-01-04T00:00:00Z"),
    });
    const span = ["2027-01-06T00:00:00.000Z", "2027-01-06T00:00:00.000Z"];

    expect((await ctx.move(task.id, span[0]!, span[1]!)).status).toBe(403);

    const outsider = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(outsider.user);
    expect((await ctx.move(task.id, span[0]!, span[1]!)).status).toBe(404);

    expect((await row(task.id)).dueDate).toEqual(
      new Date("2027-01-04T00:00:00Z"),
    );
  });

  it("is planned again by the next Apply", async () => {
    const ctx = await setup();
    await db.insert(schema.workCalendarTable).values({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      timeZone: "UTC",
      weeklyIntervals: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        startMinute: 540,
        endMinute: 1020,
      })),
      timeOff: [],
    });
    const task = await insertTask(ctx.project.id, {
      userId: ctx.user.id,
      estimateSeconds: 7200,
    });
    const base = `/project-schedule/${ctx.project.id}`;
    const plan = async () => {
      const preview = await ctx.call("POST", `${base}/preview`, {
        planFrom: "2027-01-04T09:00:00Z",
      });
      expect(preview.status).toBe(200);
      const proposal = await preview.json();
      expect(
        (
          await ctx.call("POST", `${base}/apply`, {
            asOf: proposal.asOf,
            planFrom: proposal.planFrom,
            revision: proposal.revision,
            generation: proposal.generation,
          })
        ).status,
      ).toBe(200);
    };

    await plan();
    const planned = await row(task.id);
    expect(planned.startDate).toEqual(new Date("2027-01-04T09:00:00Z"));
    expect(
      (
        await ctx.move(
          task.id,
          "2027-01-06T09:00:00.000Z",
          "2027-01-06T11:00:00.000Z",
        )
      ).status,
    ).toBe(200);
    expect((await row(task.id)).startDate).toEqual(
      new Date("2027-01-06T09:00:00Z"),
    );

    await plan();
    const replanned = await row(task.id);
    expect(replanned.startDate).toEqual(planned.startDate);
    expect(replanned.scheduleSegments).toEqual(planned.scheduleSegments);
  });
});
