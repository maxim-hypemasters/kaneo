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

async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
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
  // Monday 13:00–17:00 and Tuesday 09:00–13:00 UTC: eight planned hours.
  const planned = () =>
    insertTask(fixture.project.id, {
      userId: member.user.id,
      priority: "low",
      estimateSeconds: 28_800,
      startDate: new Date("2027-01-04T13:00:00Z"),
      dueDate: new Date("2027-01-05T13:00:00Z"),
      scheduledAssigneeId: member.user.id,
      scheduleSegments: [
        { start: "2027-01-04T13:00:00.000Z", end: "2027-01-04T17:00:00.000Z" },
        { start: "2027-01-05T09:00:00.000Z", end: "2027-01-05T13:00:00.000Z" },
      ],
    });
  return { ...member, ...fixture, call, planned };
}

const row = async (id: string) =>
  (
    await db.select().from(schema.taskTable).where(eq(schema.taskTable.id, id))
  )[0]!;

describe("setting task dates by hand", () => {
  it("sets and clears a due date, taking planned work off its estimate", async () => {
    const ctx = await setup();
    const task = await ctx.planned();
    await db
      .insert(schema.taskReminderSentTable)
      .values({ taskId: task.id, reminderType: "due_soon" });

    const response = await ctx.call("PUT", `/task/due-date/${task.id}`, {
      dueDate: "2027-01-08",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).dueDate).toBe("2027-01-08T00:00:00.000Z");
    const edited = await row(task.id);
    expect(edited.startDate).toEqual(new Date("2027-01-04T13:00:00Z"));
    expect(edited.dueDate).toEqual(new Date("2027-01-08T00:00:00Z"));
    expect(edited.scheduleSegments).toBeNull();
    expect(
      await db
        .select()
        .from(schema.taskReminderSentTable)
        .where(eq(schema.taskReminderSentTable.taskId, task.id)),
    ).toHaveLength(0);

    expect(
      (await ctx.call("PUT", `/task/due-date/${task.id}`, { dueDate: null }))
        .status,
    ).toBe(200);
    expect((await row(task.id)).dueDate).toBeNull();
  });

  it("refuses a due date before the start date", async () => {
    const ctx = await setup();
    const task = await ctx.planned();
    const response = await ctx.call("PUT", `/task/due-date/${task.id}`, {
      dueDate: "2027-01-01",
    });
    expect(response.status).toBe(400);
    expect((await row(task.id)).scheduleSegments).toHaveLength(2);
  });

  it("changes dates on a full update only when they are sent and differ", async () => {
    const ctx = await setup();
    const task = await ctx.planned();
    const body = {
      title: "Renamed",
      status: "to-do",
      priority: "low",
      projectId: ctx.project.id,
      position: task.position ?? 0,
      userId: ctx.user.id,
    };

    // No dates, then the same dates: the plan stays.
    expect((await ctx.call("PUT", `/task/${task.id}`, body)).status).toBe(200);
    expect(
      (
        await ctx.call("PUT", `/task/${task.id}`, {
          ...body,
          startDate: "2027-01-04T13:00:00.000Z",
          dueDate: "2027-01-05T13:00:00.000Z",
        })
      ).status,
    ).toBe(200);
    const kept = await row(task.id);
    expect(kept.title).toBe("Renamed");
    expect(kept.scheduleSegments).toHaveLength(2);

    expect(
      (
        await ctx.call("PUT", `/task/${task.id}`, {
          ...body,
          startDate: "2027-01-03",
        })
      ).status,
    ).toBe(200);
    const edited = await row(task.id);
    expect(edited.startDate).toEqual(new Date("2027-01-03T00:00:00Z"));
    expect(edited.dueDate).toEqual(new Date("2027-01-05T13:00:00Z"));
    expect(edited.scheduleSegments).toBeNull();

    expect(
      (await ctx.call("PUT", `/task/${task.id}`, { ...body, startDate: null }))
        .status,
    ).toBe(200);
    expect((await row(task.id)).startDate).toBeNull();
    expect(
      (
        await ctx.call("PUT", `/task/${task.id}`, {
          ...body,
          startDate: "2027-02-01",
        })
      ).status,
    ).toBe(400);
  });

  it("sets a due date on several tasks at once, but not on a Feature", async () => {
    const ctx = await setup();
    const first = await ctx.planned();
    const second = await insertTask(ctx.project.id);
    const bulk = (taskIds: string[], value: string | null) =>
      ctx.call("PATCH", "/task/bulk", {
        taskIds,
        operation: "updateDueDate",
        value,
      });

    const both = await bulk([first.id, second.id], "2027-01-09");
    expect(both.status, await both.clone().text()).toBe(200);
    expect((await row(first.id)).dueDate).toEqual(
      new Date("2027-01-09T00:00:00Z"),
    );
    expect((await row(first.id)).scheduleSegments).toBeNull();
    expect((await row(second.id)).dueDate).toEqual(
      new Date("2027-01-09T00:00:00Z"),
    );

    const cleared = await bulk([second.id], null);
    expect(cleared.status, await cleared.clone().text()).toBe(200);
    expect((await row(second.id)).dueDate).toBeNull();

    const feature = await insertTask(ctx.project.id, { type: "feature" });
    expect((await bulk([feature.id], "2027-01-09")).status).toBe(400);
  });

  it("takes a resized span exactly instead of laying the estimate out again", async () => {
    const ctx = await setup();
    const task = await ctx.planned();
    const response = await ctx.call("PUT", `/task/schedule/${task.id}`, {
      start: "2027-01-04T13:00:00.000Z",
      end: "2027-01-08T13:00:00.000Z",
      exact: true,
    });
    expect(response.status).toBe(200);
    const resized = await row(task.id);
    expect(resized.startDate).toEqual(new Date("2027-01-04T13:00:00Z"));
    expect(resized.dueDate).toEqual(new Date("2027-01-08T13:00:00Z"));
    expect(resized.scheduleSegments).toBeNull();
  });
});
