import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { getDatabase, schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { readReleaseLinkCandidates } from "../../apps/api/src/release/read-link-candidates";
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
    slug: "LINK",
  });
  const release = await insertRelease(project.id);
  mockAuthenticatedSession(member.user);
  return { ...member, project, release, app: createApp().app };
}

async function insertMilestone(
  featureId: string,
  values: Partial<typeof schema.milestoneTable.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.milestoneTable)
    .values({ featureId, title: "Checkpoint", position: 0, ...values })
    .returning();
  if (!row) throw new Error("Failed to insert milestone");
  return row;
}

describe("release link candidates", () => {
  it("includes unassigned, completed and unknown-status Tasks/Bugs, with same-project Feature and current release metadata", async () => {
    const ctx = await setup();
    const otherRelease = await insertRelease(ctx.project.id, {
      name: "Previous release",
    });
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Knowledge",
    });
    const task = await insertTask(ctx.project.id, {
      title: "Unassigned",
      featureId: feature.id,
    });
    const bug = await insertTask(ctx.project.id, {
      type: "bug",
      status: "done",
      releaseId: otherRelease.id,
    });
    const unknown = await insertTask(ctx.project.id, {
      status: "removed-column",
    });
    await insertTask(ctx.project.id, { status: "archived" });
    await insertTask(ctx.project.id, { releaseId: ctx.release.id });
    const response = await ctx.app.request(
      `/api/release/${ctx.release.id}/link-candidates?kind=task`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pagination).toEqual({
      total: 3,
      page: 1,
      limit: 50,
      totalPages: 1,
    });
    expect(body.data.map((row: { id: string }) => row.id)).toEqual([
      task.id,
      bug.id,
      unknown.id,
    ]);
    expect(body.data[0]).toEqual({
      id: task.id,
      title: task.title,
      type: "task",
      number: task.number,
      featureId: feature.id,
      featureTitle: feature.title,
      projectSlug: "LINK",
      releaseId: null,
      releaseName: null,
    });
    expect(body.data[1]).toMatchObject({
      type: "bug",
      featureId: null,
      featureTitle: null,
      releaseId: otherRelease.id,
      releaseName: otherRelease.name,
    });
    expect(body.data[2]).not.toHaveProperty("description");
    const linked = await ctx.app.request(`/api/task/release/${unknown.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: ctx.release.id }),
    });
    expect(linked.status).toBe(200);
    const boardResponse = await ctx.app.request(
      `/api/task/tasks/${ctx.project.id}`,
    );
    expect(boardResponse.status).toBe(200);
    const board = await boardResponse.json();
    expect(board.data.plannedTasks).toEqual([
      expect.objectContaining({
        id: unknown.id,
        status: "removed-column",
        releaseId: ctx.release.id,
      }),
    ]);
  });

  it("includes empty milestones and archived Feature owners, and excludes only explicitly assigned milestones", async () => {
    const ctx = await setup();
    const otherRelease = await insertRelease(ctx.project.id);
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Alpha",
    });
    const empty = await insertMilestone(feature.id, {
      title: "Empty",
      position: 1,
    });
    const referenced = await insertMilestone(feature.id, {
      title: "Shown through child",
      position: 2,
      releaseId: otherRelease.id,
    });
    await insertTask(ctx.project.id, {
      featureId: feature.id,
      milestoneId: referenced.id,
      releaseId: ctx.release.id,
    });
    await insertMilestone(feature.id, { releaseId: ctx.release.id });
    const archivedFeature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Zulu",
      archivedAt: new Date(),
    });
    const archivedOwner = await insertMilestone(archivedFeature.id);
    const response = await ctx.app.request(
      `/api/release/${ctx.release.id}/link-candidates?kind=milestone`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((row: { id: string }) => row.id)).toEqual([
      empty.id,
      referenced.id,
      archivedOwner.id,
    ]);
    expect(body.data[0]).toEqual({
      id: empty.id,
      title: empty.title,
      type: "milestone",
      number: null,
      featureId: feature.id,
      featureTitle: feature.title,
      projectSlug: "LINK",
      releaseId: null,
      releaseName: null,
    });
    expect(body.data[1]).toMatchObject({
      releaseId: otherRelease.id,
      releaseName: otherRelease.name,
    });
  });

  it("searches titles and full identifiers case-insensitively with literal LIKE characters", async () => {
    const ctx = await setup();
    const literal = await insertTask(ctx.project.id, {
      title: "Rate 50%_done\\today",
    });
    await insertTask(ctx.project.id, { title: "Rate 500Xdone today" });
    for (const q of [
      "50%_",
      "\\today",
      "rate 50%_done",
      `link-${literal.number}`,
    ]) {
      const response = await ctx.app.request(
        `/api/release/${ctx.release.id}/link-candidates?kind=task&q=${encodeURIComponent(q)}`,
      );
      expect(response.status).toBe(200);
      expect(
        (await response.json()).data.map((row: { id: string }) => row.id),
      ).toEqual([literal.id]);
    }
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Payments",
    });
    const milestone = await insertMilestone(feature.id, {
      title: "Quarter 50%",
    });
    for (const q of ["payments", "50%", "  quarter  "]) {
      const response = await ctx.app.request(
        `/api/release/${ctx.release.id}/link-candidates?kind=milestone&q=${encodeURIComponent(q)}`,
      );
      expect(
        (await response.json()).data.map((row: { id: string }) => row.id),
      ).toEqual([milestone.id]);
    }
  });

  it("filters before stable pagination and enforces default and maximum page sizes", async () => {
    const ctx = await setup();
    for (let number = 70; number > 0; number--)
      await insertTask(ctx.project.id, {
        number,
        title: number <= 5 ? `Match ${number}` : `Other ${number}`,
      });
    const read = async (query: string) =>
      (
        await ctx.app.request(
          `/api/release/${ctx.release.id}/link-candidates?kind=task${query}`,
        )
      ).json();
    const first = await read("");
    expect(first.data).toHaveLength(50);
    expect(first.pagination).toEqual({
      total: 70,
      page: 1,
      limit: 50,
      totalPages: 2,
    });
    expect(first.data.map((row: { number: number }) => row.number)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    const next = await read("&page=2");
    expect(next.data).toHaveLength(20);
    expect(next.data[0].number).toBe(51);
    const matches = await read("&q=Match&limit=2&page=2");
    expect(matches.pagination).toEqual({
      total: 5,
      page: 2,
      limit: 2,
      totalPages: 3,
    });
    expect(matches.data.map((row: { number: number }) => row.number)).toEqual([
      3, 4,
    ]);
    expect((await read("&page=100")).data).toEqual([]);
    for (const query of [
      "&limit=101",
      "&limit=0",
      "&page=-1",
      "&page=1.5",
      `&q=${"x".repeat(256)}`,
    ])
      expect(
        (
          await ctx.app.request(
            `/api/release/${ctx.release.id}/link-candidates?kind=task${query}`,
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await ctx.app.request(
          `/api/release/${ctx.release.id}/link-candidates?kind=feature`,
        )
      ).status,
    ).toBe(400);
    expect(
      (await ctx.app.request(`/api/release/${ctx.release.id}/link-candidates`))
        .status,
    ).toBe(400);
  });

  it("paginates milestones by Feature title and manual order, with stable ID tie breakers", async () => {
    const ctx = await setup();
    const zulu = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Zulu",
    });
    await insertMilestone(zulu.id);
    const alpha = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Alpha",
    });
    const second = await insertMilestone(alpha.id, { position: 2 });
    const first = await insertMilestone(alpha.id, { position: 1 });
    const tied = await insertMilestone(alpha.id, { position: 1 });
    const ordered = [first.id, tied.id].sort();
    const response = await ctx.app.request(
      `/api/release/${ctx.release.id}/link-candidates?kind=milestone&limit=2`,
    );
    const body = await response.json();
    expect(body.data.map((row: { id: string }) => row.id)).toEqual(ordered);
    expect(body.pagination).toEqual({
      total: 4,
      page: 1,
      limit: 2,
      totalPages: 2,
    });
    const next = await ctx.app.request(
      `/api/release/${ctx.release.id}/link-candidates?kind=milestone&limit=2&page=2`,
    );
    expect((await next.json()).data[0].id).toBe(second.id);
  });

  it("isolates candidates and relation metadata to the release project", async () => {
    const ctx = await setup();
    const { project: other } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const foreign = await insertTask(other.id, {
      type: "feature",
      title: "Secret foreign Feature",
    });
    await insertTask(other.id, { title: "Secret foreign task" });
    await insertMilestone(foreign.id, { title: "Secret foreign milestone" });
    const local = await insertTask(ctx.project.id, { featureId: foreign.id });
    const tasks = await ctx.app.request(
      `/api/release/${ctx.release.id}/link-candidates?kind=task`,
    );
    expect((await tasks.json()).data).toEqual([
      expect.objectContaining({
        id: local.id,
        featureId: null,
        featureTitle: null,
      }),
    ]);
    const milestones = await ctx.app.request(
      `/api/release/${ctx.release.id}/link-candidates?kind=milestone`,
    );
    expect((await milestones.json()).data).toEqual([]);
    expect(
      (await ctx.app.request("/api/release/missing/link-candidates?kind=task"))
        .status,
    ).toBe(404);
  });

  it("uses three selects regardless of candidate count and rechecks the authorized snapshot", async () => {
    const ctx = await setup();
    const counts: number[] = [];
    const database = getDatabase();
    const transaction = database.transaction.bind(database);
    const spy = vi.spyOn(database, "transaction").mockImplementation((async (
      read,
      options,
    ) =>
      transaction(async (tx) => {
        const select = vi.spyOn(tx, "select");
        try {
          return await read(tx);
        } finally {
          counts.push(select.mock.calls.length);
          select.mockRestore();
        }
      }, options)) as typeof db.transaction);
    const options = { kind: "task" as const, page: 1, limit: 50 };
    try {
      await readReleaseLinkCandidates(
        ctx.release.id,
        ctx.project.id,
        ctx.workspace.id,
        options,
      );
      for (let index = 0; index < 25; index++) await insertTask(ctx.project.id);
      await readReleaseLinkCandidates(
        ctx.release.id,
        ctx.project.id,
        ctx.workspace.id,
        options,
      );
      expect(counts).toEqual([3, 3]);
    } finally {
      spy.mockRestore();
    }
    await expect(
      readReleaseLinkCandidates(
        ctx.release.id,
        "wrong-project",
        ctx.workspace.id,
        options,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      readReleaseLinkCandidates(
        ctx.release.id,
        undefined,
        ctx.workspace.id,
        options,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const target = await createWorkspaceMember();
    await db
      .update(schema.projectTable)
      .set({ workspaceId: target.workspace.id })
      .where(eq(schema.projectTable.id, ctx.project.id));
    await expect(
      readReleaseLinkCandidates(
        ctx.release.id,
        ctx.project.id,
        ctx.workspace.id,
        options,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("keeps hierarchy on task linking and uses milestone follower rules including null", async () => {
    const ctx = await setup();
    const previous = await insertRelease(ctx.project.id);
    const override = await insertRelease(ctx.project.id);
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const milestone = await insertMilestone(feature.id);
    const follower = await insertTask(ctx.project.id, {
      featureId: feature.id,
      milestoneId: milestone.id,
    });
    const overridden = await insertTask(ctx.project.id, {
      type: "bug",
      featureId: feature.id,
      milestoneId: milestone.id,
      releaseId: override.id,
    });
    const linked = await ctx.app.request(`/api/task/release/${overridden.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: previous.id }),
    });
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({
      featureId: feature.id,
      milestoneId: milestone.id,
      releaseId: previous.id,
      type: "bug",
    });
    const moved = await ctx.app.request(`/api/milestone/${milestone.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: ctx.release.id }),
    });
    expect(moved.status).toBe(200);
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, follower.id),
      }),
    ).toMatchObject({
      releaseId: ctx.release.id,
      featureId: feature.id,
      milestoneId: milestone.id,
    });
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, overridden.id),
      }),
    ).toMatchObject({
      releaseId: previous.id,
      featureId: feature.id,
      milestoneId: milestone.id,
    });
  });
});

describe("release link candidate access", () => {
  it.each([
    [{ task: ["read"] }, 200],
    [{ task: ["update"] }, 403],
    [{ project: ["read"] }, 403],
  ] as const)(
    "requires custom role task:read %j",
    async (permission, status) => {
      const ctx = await setup("release_link_reader");
      await db.insert(schema.workspaceRoleTable).values({
        workspaceId: ctx.workspace.id,
        role: "release_link_reader",
        permission: JSON.stringify(permission),
      });
      expect(
        (
          await ctx.app.request(
            `/api/release/${ctx.release.id}/link-candidates?kind=task`,
          )
        ).status,
      ).toBe(status);
    },
  );

  it.each([
    [{ task: ["read"] }, 200],
    [{ task: ["update"] }, 403],
    [{ project: ["read"] }, 403],
  ] as const)("requires API-key task:read %j", async (permissions, status) => {
    const ctx = await setup();
    const key = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Release link scope",
        permissions: JSON.parse(JSON.stringify(permissions)),
      },
    });
    mockAnonymousSession();
    expect(
      (
        await ctx.app.request(
          `/api/release/${ctx.release.id}/link-candidates?kind=milestone`,
          { headers: { "x-api-key": key.key } },
        )
      ).status,
    ).toBe(status);
  });

  it("hides other workspaces and rejects anonymous requests", async () => {
    const ctx = await setup();
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect(
      (
        await ctx.app.request(
          `/api/release/${ctx.release.id}/link-candidates?kind=task`,
        )
      ).status,
    ).toBe(404);
    mockAnonymousSession();
    expect(
      (
        await ctx.app.request(
          `/api/release/${ctx.release.id}/link-candidates?kind=task`,
        )
      ).status,
    ).toBe(401);
  });

  it("honors restricted project membership within a workspace", async () => {
    const ctx = await createRestrictedWorkspace();
    const allowed = await insertRelease(ctx.alpha.id);
    const hidden = await insertRelease(ctx.beta.id);
    mockAuthenticatedSession(ctx.restricted);
    const app = createApp().app;
    expect(
      (
        await app.request(
          `/api/release/${allowed.id}/link-candidates?kind=task`,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/api/release/${hidden.id}/link-candidates?kind=milestone`,
        )
      ).status,
    ).toBe(403);
  });
});
