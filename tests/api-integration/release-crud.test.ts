import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { pgErrorCode } from "../../apps/api/src/utils/pg-error-code";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

// Every request in this file runs under a session time zone other than UTC,
// where a Date-mode column would shift the calendar day. Set before the lazy
// pool opens a connection.
vi.stubEnv("PGOPTIONS", "-c timezone=Europe/Paris");
afterAll(() => vi.unstubAllEnvs());

beforeEach(resetTestDatabase);

const dates = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
};

async function setup(role = "owner") {
  const member = await createWorkspaceMember({ role });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const create = (body: unknown, projectId = project.id) =>
    app.request(`/api/release/project/${projectId}`, jsonRequest("POST", body));
  const update = (id: string, body: unknown) =>
    app.request(`/api/release/${id}`, jsonRequest("PUT", body));
  return { ...member, project, columns, app, create, update };
}

async function storedRelease(id: string) {
  const [row] = await db
    .select()
    .from(schema.releaseTable)
    .where(eq(schema.releaseTable.id, id));
  return row;
}

describe("release CRUD", () => {
  it("creates, reads, lists and updates a release", async () => {
    const ctx = await setup();

    const created = await ctx.create({
      name: "  2.4  ",
      description: "Autumn release",
      ...dates,
    });
    expect(created.status).toBe(200);
    const release = await created.json();
    expect(Object.keys(release).sort()).toEqual(
      [
        "codeFreezeDate",
        "createdAt",
        "description",
        "id",
        "name",
        "projectId",
        "startDate",
        "submissionDate",
        "updatedAt",
      ].sort(),
    );
    expect(release).toMatchObject({
      projectId: ctx.project.id,
      name: "2.4",
      description: "Autumn release",
      ...dates,
    });

    const progress = {
      tasks: { total: 0, completed: 0 },
      features: { total: 0, completed: 0 },
      milestones: { total: 0, completed: 0 },
      unfinished: 0,
    };
    const read = await ctx.app.request(`/api/release/${release.id}`);
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ ...release, progress });

    const list = await ctx.app.request(
      `/api/release/project/${ctx.project.id}`,
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([{ ...release, progress }]);

    const updated = await ctx.update(release.id, {
      name: " 2.4.1 ",
      submissionDate: "2026-10-22",
    });
    expect(updated.status).toBe(200);
    const after = await updated.json();
    expect(after).toMatchObject({
      id: release.id,
      name: "2.4.1",
      description: "Autumn release",
      ...dates,
      submissionDate: "2026-10-22",
    });
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(release.updatedAt).getTime(),
    );

    const cleared = await ctx.update(release.id, { description: null });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({
      name: "2.4.1",
      description: null,
    });
  });

  it("orders the list by start date, then name, and shows only the project's releases", async () => {
    const ctx = await setup();
    const { project: other } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    await insertRelease(ctx.project.id, {
      name: "later",
      startDate: "2026-11-01",
      codeFreezeDate: "2026-11-10",
      submissionDate: "2026-11-20",
    });
    await insertRelease(ctx.project.id, { name: "b" });
    await insertRelease(ctx.project.id, { name: "a" });
    await insertRelease(other.id, { name: "elsewhere" });

    const list = await ctx.app.request(
      `/api/release/project/${ctx.project.id}`,
    );
    expect(
      ((await list.json()) as { name: string }[]).map(({ name }) => name),
    ).toEqual(["a", "b", "later"]);
  });

  it("returns 404 for a release that doesn't exist", async () => {
    const ctx = await setup();
    expect((await ctx.app.request("/api/release/missing")).status).toBe(404);
    const update = await ctx.update("missing", { name: "x" });
    expect(update.status).toBe(404);
    expect(await update.json()).toMatchObject({ message: "Release not found" });
  });
});

describe("release names", () => {
  it("rejects a duplicate name on create and on rename, after trimming", async () => {
    const ctx = await setup();
    const first = await insertRelease(ctx.project.id, { name: "2.4" });
    const second = await insertRelease(ctx.project.id, { name: "2.5" });

    for (const name of ["2.4", " 2.4 "]) {
      const duplicate = await ctx.create({ name, ...dates });
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toMatchObject({
        message: "A release with this name already exists in this project",
      });
    }

    const rename = await ctx.update(second.id, { name: " 2.4" });
    expect(rename.status).toBe(409);
    expect((await storedRelease(second.id))?.name).toBe("2.5");

    expect((await ctx.update(first.id, { name: "2.4" })).status).toBe(200);

    const { project: other } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    expect((await ctx.create({ name: "2.4", ...dates }, other.id)).status).toBe(
      200,
    );
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["too long", "x".repeat(101)],
  ])("rejects a %s name", async (_kind, name) => {
    const ctx = await setup();
    expect((await ctx.create({ name, ...dates })).status).toBe(400);
  });

  it("rejects a description over 10,000 characters", async () => {
    const ctx = await setup();
    const response = await ctx.create({
      name: "2.4",
      description: "x".repeat(10_001),
      ...dates,
    });
    expect(response.status).toBe(400);
  });
});

describe("release dates", () => {
  it.each([
    ["a malformed day", "2026/10/01"],
    ["an impossible day", "2026-02-30"],
    ["a datetime", "2026-10-01T00:00:00.000Z"],
    ["a number", 20261001],
  ])("rejects %s", async (_kind, startDate) => {
    const ctx = await setup();
    const created = await ctx.create({ name: "2.4", ...dates, startDate });
    expect(created.status).toBe(400);

    const release = await insertRelease(ctx.project.id);
    expect((await ctx.update(release.id, { startDate })).status).toBe(400);
    expect((await storedRelease(release.id))?.startDate).toBe(
      release.startDate,
    );
  });

  it("requires all three dates on create", async () => {
    const ctx = await setup();
    const { submissionDate: _omitted, ...twoDates } = dates;
    expect((await ctx.create({ name: "2.4", ...twoDates })).status).toBe(400);
  });

  it.each([
    ["start after code freeze", { startDate: "2026-10-16" }],
    ["code freeze after submission", { codeFreezeDate: "2026-10-21" }],
  ])("rejects %s on create", async (_kind, change) => {
    const ctx = await setup();
    const response = await ctx.create({ name: "2.4", ...dates, ...change });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Dates must run start ≤ code freeze ≤ submission",
    });
  });

  it("allows equal dates", async () => {
    const ctx = await setup();
    const response = await ctx.create({
      name: "Hotfix",
      startDate: "2026-10-20",
      codeFreezeDate: "2026-10-20",
      submissionDate: "2026-10-20",
    });
    expect(response.status).toBe(200);
  });

  it("checks a partial update against the stored dates", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id, dates);

    for (const change of [
      { codeFreezeDate: "2026-09-30" },
      { startDate: "2026-10-16" },
      { submissionDate: "2026-10-14" },
    ]) {
      const response = await ctx.update(release.id, change);
      expect(response.status, JSON.stringify(change)).toBe(400);
      expect(await response.json()).toMatchObject({
        message: "Dates must run start ≤ code freeze ≤ submission",
      });
    }
    expect(await storedRelease(release.id)).toMatchObject(dates);

    const moved = await ctx.update(release.id, {
      startDate: "2026-10-16",
      codeFreezeDate: "2026-10-18",
    });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({
      startDate: "2026-10-16",
      codeFreezeDate: "2026-10-18",
      submissionDate: "2026-10-20",
    });
  });

  it("enforces the date order in the database", async () => {
    const { project } = await createProjectFixture({
      workspaceId: (await createWorkspaceMember()).workspace.id,
    });
    const insert = db.execute(sql`
      insert into release (id, project_id, name, start_date, code_freeze_date, submission_date)
      values ('bad-order', ${project.id}, 'Bad', '2026-10-16', '2026-10-15', '2026-10-20')
    `);
    await expect(insert).rejects.toSatisfy(
      (error) => pgErrorCode(error) === "23514",
    );

    const release = await insertRelease(project.id, dates);
    const update = db.execute(
      sql`update release set submission_date = '2026-10-14' where id = ${release.id}`,
    );
    await expect(update).rejects.toSatisfy(
      (error) => pgErrorCode(error) === "23514",
    );
  });

  it("keeps calendar days as YYYY-MM-DD under a non-UTC session time zone", async () => {
    const zone = await db.execute<{ zone: string }>(
      sql`select current_setting('TimeZone') as zone`,
    );
    expect(zone.rows[0]?.zone).toBe("Europe/Paris");

    const ctx = await setup();
    // Paris moves its clocks on 2026-03-29 and 2026-10-25.
    const days = {
      startDate: "2026-03-29",
      codeFreezeDate: "2026-10-25",
      submissionDate: "2026-12-31",
    };
    const created = await ctx.create({ name: "DST", ...days });
    expect(created.status).toBe(200);
    const release = await created.json();
    expect(release).toMatchObject(days);

    expect(
      await (await ctx.app.request(`/api/release/${release.id}`)).json(),
    ).toMatchObject(days);
    const stored = await db.execute<Record<string, string>>(sql`
      select start_date::text as "startDate",
             code_freeze_date::text as "codeFreezeDate",
             submission_date::text as "submissionDate"
      from release where id = ${release.id}
    `);
    expect(stored.rows[0]).toEqual(days);
  });
});

describe("release progress", () => {
  it("counts tasks and features, completed by final column, unfinished without archived", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id, { name: "2.4" });
    const other = await insertRelease(ctx.project.id, { name: "2.5" });
    const inRelease = { releaseId: release.id };

    await insertTask(ctx.project.id, { ...inRelease, status: "to-do" });
    await insertTask(ctx.project.id, { ...inRelease, status: "done" });
    await insertTask(ctx.project.id, { ...inRelease, status: "archived" });
    await insertTask(ctx.project.id, { ...inRelease, status: "planned" });
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const secondFeature = await insertTask(ctx.project.id, { type: "feature" });
    await db.insert(schema.milestoneTable).values([
      {
        featureId: feature.id,
        title: "Active",
        status: "in-progress",
        columnId: ctx.columns.inProgress.id,
        releaseId: release.id,
        position: 0,
      },
      {
        featureId: secondFeature.id,
        title: "Complete",
        status: "done",
        columnId: ctx.columns.done.id,
        releaseId: release.id,
        position: 0,
      },
    ]);
    await insertTask(ctx.project.id, { releaseId: other.id, status: "done" });
    await insertTask(ctx.project.id, { status: "to-do" });

    const read = async () =>
      (await (await ctx.app.request(`/api/release/${release.id}`)).json())
        .progress;
    expect(await read()).toEqual({
      tasks: { total: 4, completed: 1 },
      features: { total: 2, completed: 0 },
      milestones: { total: 2, completed: 1 },
      unfinished: 3,
    });

    // Completion follows the project's final columns.
    await db
      .update(schema.columnTable)
      .set({ isFinal: true })
      .where(eq(schema.columnTable.id, ctx.columns.inProgress.id));
    expect(await read()).toEqual({
      tasks: { total: 4, completed: 1 },
      features: { total: 2, completed: 0 },
      milestones: { total: 2, completed: 2 },
      unfinished: 2,
    });

    const list = await (
      await ctx.app.request(`/api/release/project/${ctx.project.id}`)
    ).json();
    expect(
      list.map((item: { name: string; progress: unknown }) => [
        item.name,
        item.progress,
      ]),
    ).toEqual([
      [
        "2.4",
        {
          tasks: { total: 4, completed: 1 },
          features: { total: 2, completed: 0 },
          milestones: { total: 2, completed: 2 },
          unfinished: 2,
        },
      ],
      [
        "2.5",
        {
          tasks: { total: 1, completed: 1 },
          features: { total: 0, completed: 0 },
          milestones: { total: 0, completed: 0 },
          unfinished: 0,
        },
      ],
    ]);
  });
});

describe("deleting what holds releases", () => {
  async function releasedProject() {
    const member = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const release = await insertRelease(project.id);
    const feature = await insertTask(project.id, { type: "feature" });
    await db.insert(schema.milestoneTable).values({
      featureId: feature.id,
      title: "Delivery",
      releaseId: release.id,
      position: 0,
    });
    const task = await insertTask(project.id, { featureId: feature.id });
    await db.execute(
      sql`update task set release_id = ${release.id} where id = ${task.id}`,
    );
    return { ...member, project, release };
  }

  async function remaining(projectId: string) {
    const [releases, tasks] = await Promise.all([
      db
        .select()
        .from(schema.releaseTable)
        .where(eq(schema.releaseTable.projectId, projectId)),
      db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, projectId)),
    ]);
    return { releases: releases.length, tasks: tasks.length };
  }

  it("deletes a project with releases and released tasks", async () => {
    const ctx = await releasedProject();
    expect(await remaining(ctx.project.id)).toEqual({ releases: 1, tasks: 2 });
    mockAuthenticatedSession(ctx.user);
    const { app } = createApp();

    const response = await app.request(`/api/project/${ctx.project.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(await remaining(ctx.project.id)).toEqual({ releases: 0, tasks: 0 });
  });

  it("deletes a workspace with releases and released tasks", async () => {
    const ctx = await releasedProject();
    const token = `delete-${randomUUID()}`;
    await db.insert(schema.sessionTable).values({
      id: randomUUID(),
      userId: ctx.user.id,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await auth.handler(
      new Request("http://localhost:1337/api/auth/organization/delete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ organizationId: ctx.workspace.id }),
      }),
    );

    expect(response.status).toBe(200);
    expect(
      await db
        .select()
        .from(schema.workspaceTable)
        .where(eq(schema.workspaceTable.id, ctx.workspace.id)),
    ).toEqual([]);
    expect(await remaining(ctx.project.id)).toEqual({ releases: 0, tasks: 0 });
  });
});
