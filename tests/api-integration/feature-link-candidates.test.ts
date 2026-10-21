import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { getDatabase, schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { readFeatureLinkCandidates } from "../../apps/api/src/task/controllers/read-feature-link-candidates";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);
async function setup(role = "owner") {
  const member = await createWorkspaceMember({ role });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
    slug: "FEATURE",
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const read = (query = "") =>
    app.request(`/api/task/feature-link-candidates/${project.id}${query}`);
  return { ...member, project, app, read };
}

describe("new Feature link candidates", () => {
  it("returns only unowned nonarchived Tasks/Bugs, including Done and unknown statuses", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id);
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const task = await insertTask(ctx.project.id);
    const bug = await insertTask(ctx.project.id, {
      type: "bug",
      status: "done",
      releaseId: release.id,
    });
    const unknown = await insertTask(ctx.project.id, {
      status: "removed-column",
    });
    await insertTask(ctx.project.id, { featureId: feature.id });
    await insertTask(ctx.project.id, { status: "archived" });
    const response = await ctx.read();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination).toEqual({
      total: 3,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
    expect(body.data).toEqual([
      {
        id: task.id,
        title: task.title,
        number: task.number,
        type: "task",
        projectSlug: "FEATURE",
        releaseId: null,
        releaseName: null,
      },
      {
        id: bug.id,
        title: bug.title,
        number: bug.number,
        type: "bug",
        projectSlug: "FEATURE",
        releaseId: release.id,
        releaseName: release.name,
      },
      {
        id: unknown.id,
        title: unknown.title,
        number: unknown.number,
        type: "task",
        projectSlug: "FEATURE",
        releaseId: null,
        releaseName: null,
      },
    ]);
    expect(body.data[0]).not.toHaveProperty("description");
    expect(body.data[0]).not.toHaveProperty("progress");
  });

  it("searches titles and full identifiers with literal LIKE characters before pagination", async () => {
    const ctx = await setup();
    const match = await insertTask(ctx.project.id, {
      title: "Rate 50%_done\\today",
    });
    await insertTask(ctx.project.id, { title: "Rate 500Xdone today" });
    for (const q of [
      "50%_",
      "\\today",
      "  rate 50%_done  ",
      `feature-${match.number}`,
    ]) {
      const response = await ctx.read(`?q=${encodeURIComponent(q)}`);
      expect(response.status).toBe(200);
      expect(
        (await response.json()).data.map((row: { id: string }) => row.id),
      ).toEqual([match.id]);
    }
  });

  it("uses deterministic pagination, default 50, max 100 and bounded search", async () => {
    const ctx = await setup();
    for (let number = 70; number > 0; number--)
      await insertTask(ctx.project.id, {
        number,
        title: number <= 5 ? `Match ${number}` : `Other ${number}`,
      });
    const first = await (await ctx.read()).json();
    expect(first.data.map((row: { number: number }) => row.number)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    expect(first.pagination).toEqual({
      total: 70,
      page: 1,
      limit: 50,
      totalPages: 2,
    });
    const next = await (await ctx.read("?page=2")).json();
    expect(next.data).toHaveLength(20);
    expect(next.data[0].number).toBe(51);
    const matches = await (await ctx.read("?q=Match&limit=2&page=2")).json();
    expect(matches.pagination).toEqual({
      total: 5,
      page: 2,
      limit: 2,
      totalPages: 3,
    });
    expect(matches.data.map((row: { number: number }) => row.number)).toEqual([
      3, 4,
    ]);
    expect((await (await ctx.read("?page=100")).json()).data).toEqual([]);
    expect((await (await ctx.read("?limit=100")).json()).data).toHaveLength(70);
    for (const query of [
      "?limit=101",
      "?limit=0",
      "?page=-1",
      "?page=1.5",
      `?q=${"x".repeat(256)}`,
    ])
      expect((await ctx.read(query)).status).toBe(400);
  });

  it("scopes rows and release metadata to the authorized project", async () => {
    const ctx = await setup();
    const foreign = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const foreignRelease = await insertRelease(foreign.project.id);
    await insertTask(foreign.project.id, {
      title: "Secret task",
      releaseId: foreignRelease.id,
    });
    const local = await insertTask(ctx.project.id);
    const body = await (await ctx.read()).json();
    expect(body.data).toEqual([
      expect.objectContaining({
        id: local.id,
        releaseId: null,
        releaseName: null,
      }),
    ]);
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect((await ctx.read()).status).toBe(404);
  });

  it("requires task:read for sessions and API keys", async () => {
    const ctx = await setup("creator");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "creator",
      permission: JSON.stringify({ task: ["create"] }),
    });
    expect((await ctx.read()).status).toBe(403);
    await db
      .update(schema.workspaceUserTable)
      .set({ role: "owner" })
      .where(eq(schema.workspaceUserTable.userId, ctx.user.id));
    vi.restoreAllMocks();
    const create = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Create",
        permissions: { task: ["create"] },
      },
    });
    const read = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Read",
        permissions: { task: ["read"] },
      },
    });
    const request = (key: string) =>
      ctx.app.request(`/api/task/feature-link-candidates/${ctx.project.id}`, {
        headers: { "x-api-key": key },
      });
    expect((await request(create.key)).status).toBe(403);
    expect((await request(read.key)).status).toBe(200);
    mockAnonymousSession();
    expect((await ctx.read()).status).toBe(401);
  });

  it("denies inaccessible projects within the same workspace", async () => {
    const ctx = await createRestrictedWorkspace();
    mockAuthenticatedSession(ctx.restricted);
    const app = createApp().app;
    expect(
      (await app.request(`/api/task/feature-link-candidates/${ctx.alpha.id}`))
        .status,
    ).toBe(200);
    expect(
      (await app.request(`/api/task/feature-link-candidates/${ctx.beta.id}`))
        .status,
    ).toBe(403);
  });

  it("checks the authorized workspace snapshot and uses one bounded batch read", async () => {
    const ctx = await setup();
    await insertTask(ctx.project.id);
    const transaction = vi.spyOn(getDatabase(), "transaction");
    const body = await readFeatureLinkCandidates(
      ctx.project.id,
      ctx.workspace.id,
      { page: 1, limit: 50 },
    );
    expect(body.data).toHaveLength(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    await expect(
      readFeatureLinkCandidates(ctx.project.id, "wrong-workspace", {
        page: 1,
        limit: 50,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
