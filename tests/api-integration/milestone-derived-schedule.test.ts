import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { readMilestone } from "../../apps/api/src/milestone/read-milestones";
import { readMilestoneExecution } from "../../apps/api/src/milestone/execution";
import {
  createMilestone,
  updateMilestone,
} from "../../apps/api/src/milestone/write-milestones";
import updateTaskMilestone from "../../apps/api/src/task/controllers/update-task-milestone";
import updateTaskDueDate from "../../apps/api/src/task/controllers/update-task-due-date";
import exportTasks from "../../apps/api/src/task/controllers/export-tasks";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(resetTestDatabase);

async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const feature = await insertTask(fixture.project.id, { type: "feature" });
  const release = await insertRelease(fixture.project.id);
  const milestone = await createMilestone(
    feature.id,
    { title: "Delivery", releaseId: release.id },
    member.user.id,
  );
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const call = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const leaf = (values: Partial<typeof schema.taskTable.$inferInsert> = {}) =>
    insertTask(fixture.project.id, {
      featureId: feature.id,
      milestoneId: milestone.id,
      ...values,
    });
  return { ...member, ...fixture, feature, release, milestone, call, leaf };
}

describe("derived milestone schedules", () => {
  it("covers normalized Task/Bug intervals and ignores archived, undated and invalid-owner work", async () => {
    const ctx = await setup();
    await ctx.leaf({ startDate: new Date("2026-10-20T00:00:00Z") });
    await ctx.leaf({
      type: "bug",
      dueDate: new Date("2026-10-28T00:00:00Z"),
      status: "done",
    });
    await ctx.leaf({
      startDate: new Date("2026-10-25T00:00:00Z"),
      dueDate: new Date("2026-10-18T00:00:00Z"),
      status: "planned",
    });
    await ctx.leaf({
      startDate: new Date("2026-09-01T00:00:00Z"),
      dueDate: new Date("2026-12-01T00:00:00Z"),
      status: "archived",
    });
    await ctx.leaf();
    const otherFeature = await insertTask(ctx.project.id, { type: "feature" });
    await ctx.leaf({
      featureId: otherFeature.id,
      startDate: new Date("2020-01-01T00:00:00Z"),
    });
    const otherProject = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    await insertTask(otherProject.project.id, {
      featureId: ctx.feature.id,
      milestoneId: ctx.milestone.id,
      dueDate: new Date("2030-01-01T00:00:00Z"),
    });
    const result = await readMilestone(ctx.milestone.id);
    expect(result).toMatchObject({
      startDate: "2026-10-18",
      endDate: "2026-10-28",
    });
    expect(result.progress.total).toBe(5);
  });

  it("returns null for empty, undated-only and archived-only milestones without using former manual dates", async () => {
    const ctx = await setup();
    await db
      .update(schema.milestoneTable)
      .set({ legacyStartDate: "2020-01-01", legacyEndDate: "2030-01-01" })
      .where(eq(schema.milestoneTable.id, ctx.milestone.id));
    for (const next of [
      undefined,
      {},
      { status: "archived", dueDate: new Date("2026-10-21T00:00:00Z") },
    ]) {
      if (next) await ctx.leaf(next);
      const result = await readMilestone(ctx.milestone.id);
      expect(result).toMatchObject({ startDate: null, endDate: null });
      expect(result).not.toHaveProperty("legacyStartDate");
      expect(result).not.toHaveProperty("legacyEndDate");
    }
    expect(
      await db.query.milestoneTable.findFirst({
        where: eq(schema.milestoneTable.id, ctx.milestone.id),
      }),
    ).toMatchObject({
      legacyStartDate: "2020-01-01",
      legacyEndDate: "2030-01-01",
    });
  });

  it("returns ISO calendar days for scheduled years below 1000", async () => {
    const ctx = await setup();
    await ctx.leaf({
      startDate: new Date("0001-01-01T00:00:00Z"),
      dueDate: new Date("0999-12-31T00:00:00Z"),
    });
    expect(
      await (await ctx.call("GET", `/milestone/${ctx.milestone.id}`)).json(),
    ).toMatchObject({ startDate: "0001-01-01", endDate: "0999-12-31" });
  });

  it.each([
    { zone: "Europe/Belgrade", start: "2026-10-24", end: "2026-10-26" },
    { zone: "America/Los_Angeles", start: "2026-10-23", end: "2026-10-25" },
    { zone: "UTC", start: "2026-10-23", end: "2026-10-25" },
  ])(
    "aligns all metadata responses with task dates in $zone across DST",
    async ({ zone, start, end }) => {
      const ctx = await setup();
      await ctx.leaf({
        startDate: new Date("2026-10-23T22:00:00Z"),
        dueDate: new Date("2026-10-25T23:00:00Z"),
      });
      const query = `?timeZone=${encodeURIComponent(zone)}`;
      const expected = { startDate: start, endDate: end };
      const get = await ctx.call(
        "GET",
        `/milestone/${ctx.milestone.id}${query}`,
      );
      expect(get.status).toBe(200);
      expect(await get.json()).toMatchObject(expected);
      expect(
        (
          await (
            await ctx.call(
              "GET",
              `/milestone/feature/${ctx.feature.id}${query}`,
            )
          ).json()
        )[0],
      ).toMatchObject(expected);
      expect(
        (
          await (
            await ctx.call(
              "GET",
              `/milestone/project/${ctx.project.id}${query}&limit=1`,
            )
          ).json()
        ).data[0],
      ).toMatchObject(expected);
      expect(
        (
          await (
            await ctx.call(
              "GET",
              `/release/${ctx.release.id}/milestones${query}`,
            )
          ).json()
        )[0],
      ).toMatchObject(expected);
      expect(
        await (
          await ctx.call("PATCH", `/milestone/${ctx.milestone.id}${query}`, {
            title: "Updated",
          })
        ).json(),
      ).toMatchObject(expected);
      expect(
        (
          await (
            await ctx.call(
              "PUT",
              `/milestone/feature/${ctx.feature.id}/order${query}`,
              { milestoneIds: [ctx.milestone.id] },
            )
          ).json()
        )[0],
      ).toMatchObject(expected);
      expect(
        await (await ctx.call("GET", `/milestone/${ctx.milestone.id}`)).json(),
      ).toMatchObject({ startDate: "2026-10-23", endDate: "2026-10-25" });
    },
  );

  it("derives the create response after atomically linking selected work in the requested timezone", async () => {
    const ctx = await setup();
    const leaf = await ctx.leaf({
      milestoneId: null,
      dueDate: new Date("2026-10-19T22:00:00Z"),
    });
    const response = await ctx.call(
      "POST",
      `/milestone/feature/${ctx.feature.id}?timeZone=Europe/Belgrade`,
      { title: "Selected work", taskIds: [leaf.id] },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      progress: { total: 1 },
    });
  });

  it("keeps schedules independent of release filtering, child progress totals and editable metadata", async () => {
    const ctx = await setup();
    const otherRelease = await insertRelease(ctx.project.id, {
      name: "Override",
    });
    await ctx.leaf({
      releaseId: ctx.release.id,
      dueDate: new Date("2026-10-20T00:00:00Z"),
    });
    await ctx.leaf({
      releaseId: otherRelease.id,
      dueDate: new Date("2026-11-20T00:00:00Z"),
    });
    await ctx.leaf({
      status: "archived",
      dueDate: new Date("2027-01-01T00:00:00Z"),
    });
    const historyBefore = await db
      .select()
      .from(schema.releaseProgressEventTable);
    const result = await updateMilestone(
      ctx.milestone.id,
      { priority: "high" },
      ctx.user.id,
    );
    expect(result).toMatchObject({
      startDate: "2026-10-20",
      endDate: "2026-11-20",
      progress: { total: 3 },
    });
    expect(
      (
        await (
          await ctx.call("GET", `/release/${ctx.release.id}/milestones`)
        ).json()
      )[0],
    ).toMatchObject({ startDate: "2026-10-20", endDate: "2026-11-20" });
    expect(await db.select().from(schema.releaseProgressEventTable)).toEqual(
      historyBefore,
    );
  });

  it("reflects date edits, archive/reopen, membership changes and deletion without materialized writes", async () => {
    const ctx = await setup();
    const task = await ctx.leaf({ dueDate: new Date("2026-10-20T00:00:00Z") });
    expect(
      (
        await ctx.call("PUT", `/task/due-date/${task.id}`, {
          dueDate: "2026-10-25",
        })
      ).status,
    ).toBe(200);
    expect(await readMilestone(ctx.milestone.id)).toMatchObject({
      startDate: "2026-10-25",
      endDate: "2026-10-25",
    });
    expect(
      (await ctx.call("PUT", `/task/status/${task.id}`, { status: "archived" }))
        .status,
    ).toBe(200);
    expect(await readMilestone(ctx.milestone.id)).toMatchObject({
      startDate: null,
      endDate: null,
    });
    expect(
      (await ctx.call("PUT", `/task/status/${task.id}`, { status: "to-do" }))
        .status,
    ).toBe(200);
    expect(await readMilestone(ctx.milestone.id)).toMatchObject({
      startDate: "2026-10-25",
      endDate: "2026-10-25",
    });
    await updateTaskMilestone({
      id: task.id,
      milestoneId: null,
      currentUserId: ctx.user.id,
    });
    expect(await readMilestone(ctx.milestone.id)).toMatchObject({
      startDate: null,
      endDate: null,
    });
    await updateTaskMilestone({
      id: task.id,
      milestoneId: ctx.milestone.id,
      currentUserId: ctx.user.id,
    });
    expect((await ctx.call("DELETE", `/task/${task.id}`)).status).toBe(200);
    expect(await readMilestone(ctx.milestone.id)).toMatchObject({
      startDate: null,
      endDate: null,
    });
  });

  it("calculates the committed result after concurrent task date and membership edits", async () => {
    const ctx = await setup();
    const second = await createMilestone(
      ctx.feature.id,
      { title: "Second" },
      ctx.user.id,
    );
    const leaf = await ctx.leaf({ dueDate: new Date("2026-10-20T00:00:00Z") });
    await Promise.all([
      updateTaskMilestone({
        id: leaf.id,
        milestoneId: second.id,
        currentUserId: ctx.user.id,
      }),
      updateTaskDueDate({
        id: leaf.id,
        dueDate: new Date("2026-10-28T00:00:00Z"),
        currentUserId: ctx.user.id,
      }),
    ]);
    expect(await readMilestone(ctx.milestone.id)).toMatchObject({
      startDate: null,
      endDate: null,
    });
    expect(await readMilestone(second.id)).toMatchObject({
      startDate: "2026-10-28",
      endDate: "2026-10-28",
    });
  });

  it("uses one bounded aggregate for a project page and keeps all linked work beyond task pagination", async () => {
    const ctx = await setup();
    for (let day = 1; day <= 12; day++)
      await ctx.leaf({
        dueDate: new Date(`2026-10-${String(day).padStart(2, "0")}T00:00:00Z`),
      });
    const second = await createMilestone(
      ctx.feature.id,
      { title: "Second" },
      ctx.user.id,
    );
    const result = await readMilestoneExecution(db, ctx.project.id, [
      ctx.milestone.id,
      second.id,
    ]);
    expect(result.get(ctx.milestone.id)).toMatchObject({
      startDate: "2026-10-01",
      endDate: "2026-10-12",
    });
    const page = await (
      await ctx.call(
        "GET",
        `/milestone/project/${ctx.project.id}?page=1&limit=1`,
      )
    ).json();
    expect(page.pagination).toMatchObject({ total: 2, totalPages: 2 });
    expect(page.data[0]).toMatchObject({
      startDate: "2026-10-01",
      endDate: "2026-10-12",
    });
    const exported = await exportTasks(ctx.project.id, ctx.user.id);
    expect(exported.milestones[0]).toMatchObject({
      startDate: "2026-10-01",
      endDate: "2026-10-12",
    });
  });

  it("rejects invalid timezone values on every metadata response route", async () => {
    const ctx = await setup();
    for (const [method, path, body] of [
      ["GET", `/milestone/${ctx.milestone.id}`],
      ["GET", `/milestone/feature/${ctx.feature.id}`],
      ["GET", `/milestone/project/${ctx.project.id}`],
      ["GET", `/release/${ctx.release.id}/milestones`],
      ["POST", `/milestone/feature/${ctx.feature.id}`, { title: "Rejected" }],
      ["PATCH", `/milestone/${ctx.milestone.id}`, { title: "Rejected" }],
      [
        "PUT",
        `/milestone/feature/${ctx.feature.id}/order`,
        { milestoneIds: [ctx.milestone.id] },
      ],
    ] as const) {
      expect(
        (await ctx.call(method, `${path}?timeZone=Invalid/Zone`, body)).status,
        `${method} ${path}`,
      ).toBe(400);
    }
    expect((await readMilestone(ctx.milestone.id)).title).toBe("Delivery");
  });

  it("keeps authorization in front of derived date reads", async () => {
    const ctx = await setup();
    const outsider = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(outsider.user);
    expect(
      (
        await ctx.call(
          "GET",
          `/milestone/${ctx.milestone.id}?timeZone=Europe/Belgrade`,
        )
      ).status,
    ).toBe(404);
    mockAnonymousSession();
    expect(
      (await ctx.call("GET", `/milestone/${ctx.milestone.id}`)).status,
    ).toBe(401);
  });
});
