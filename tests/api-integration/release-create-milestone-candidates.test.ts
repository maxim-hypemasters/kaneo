import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { getDatabase, schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { readReleaseMilestoneLinkCandidates } from "../../apps/api/src/release/read-milestone-link-candidates";
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
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const read = (query = "", projectId = project.id, headers?: HeadersInit) =>
    app.request(
      `/api/release/project/${projectId}/milestone-link-candidates${query}`,
      { headers },
    );
  return { ...member, project, read };
}

async function insertMilestone(
  featureId: string,
  values: Partial<typeof schema.milestoneTable.$inferInsert> = {},
) {
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({
      featureId,
      title: "Checkpoint",
      position: 0,
      ...values,
    })
    .returning();
  if (!milestone) throw new Error("Failed to insert milestone");
  return milestone;
}

describe("milestones available while creating a release", () => {
  it("returns only unassigned milestones, including empty/completed milestones and archived Feature owners", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Alpha",
    });
    const empty = await insertMilestone(feature.id, {
      title: "Empty",
      position: 0,
    });
    const completed = await insertMilestone(feature.id, {
      title: "Complete",
      position: 1,
    });
    await insertTask(ctx.project.id, {
      featureId: feature.id,
      milestoneId: completed.id,
      type: "bug",
      status: "done",
    });
    const release = await insertRelease(ctx.project.id);
    await insertMilestone(feature.id, { releaseId: release.id, position: 2 });
    const archived = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Zulu",
      archivedAt: new Date(),
    });
    const archivedOwner = await insertMilestone(archived.id);

    const response = await ctx.read();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      data: [empty, completed, archivedOwner].map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        featureId: milestone.featureId,
        featureTitle:
          milestone.featureId === feature.id ? feature.title : archived.title,
      })),
      pagination: { total: 3, page: 1, limit: 50, totalPages: 1 },
    });
    expect(body.data[0]).not.toHaveProperty("progress");
    expect(body.data[0]).not.toHaveProperty("startDate");
  });

  it("searches milestone and Feature titles case-insensitively, with literal LIKE characters", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Payments",
    });
    const literal = await insertMilestone(feature.id, {
      title: "Quarter 50%_done\\today",
    });
    const other = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Other",
    });
    await insertMilestone(other.id, { title: "Quarter 500Xdone today" });
    for (const q of ["payments", "50%_", "\\today", "  quarter 50%  "]) {
      const response = await ctx.read(`?q=${encodeURIComponent(q)}`);
      expect(response.status).toBe(200);
      expect(
        (await response.json()).data.map((row: { id: string }) => row.id),
      ).toEqual([literal.id]);
    }
    expect((await (await ctx.read("?q=missing")).json()).data).toEqual([]);
  });

  it("applies eligibility/search before pagination and orders by Feature, manual position and IDs", async () => {
    const ctx = await setup();
    const zulu = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Zulu",
    });
    await insertMilestone(zulu.id, { title: "Match" });
    const alpha = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Alpha",
    });
    const second = await insertMilestone(alpha.id, {
      title: "Match",
      position: 2,
    });
    const first = await insertMilestone(alpha.id, {
      title: "Match",
      position: 1,
    });
    const tied = await insertMilestone(alpha.id, {
      title: "Match",
      position: 1,
    });
    const assigned = await insertRelease(ctx.project.id);
    await insertMilestone(alpha.id, {
      title: "Match",
      releaseId: assigned.id,
      position: 0,
    });
    await insertMilestone(alpha.id, {
      title: "Excluded by search",
      position: 0,
    });
    const response = await ctx.read("?q=Match&limit=2");
    expect(response.status).toBe(200);
    const firstPage = await response.json();
    expect(firstPage.pagination).toEqual({
      total: 4,
      page: 1,
      limit: 2,
      totalPages: 2,
    });
    expect(firstPage.data.map((row: { id: string }) => row.id)).toEqual(
      [first.id, tied.id].sort(),
    );
    const next = await (await ctx.read("?q=Match&limit=2&page=2")).json();
    expect(next.data[0].id).toBe(second.id);
    expect((await (await ctx.read("?page=100")).json()).data).toEqual([]);
  });

  it("uses the default page size and rejects invalid pagination/search", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    await db.insert(schema.milestoneTable).values(
      Array.from({ length: 55 }, (_, position) => ({
        featureId: feature.id,
        title: `Milestone ${position}`,
        position,
      })),
    );
    const first = await (await ctx.read()).json();
    expect(first.data).toHaveLength(50);
    expect(first.pagination).toEqual({
      total: 55,
      page: 1,
      limit: 50,
      totalPages: 2,
    });
    expect((await (await ctx.read("?limit=100")).json()).data).toHaveLength(55);
    for (const query of [
      "?limit=101",
      "?limit=0",
      "?page=-1",
      "?page=1.5",
      `?q=${"x".repeat(256)}`,
    ])
      expect((await ctx.read(query)).status, query).toBe(400);
  });

  it("keeps candidates inside the authorized project and workspace", async () => {
    const ctx = await setup();
    const { project: sibling } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const foreignMember = await createWorkspaceMember();
    const { project: foreign } = await createProjectFixture({
      workspaceId: foreignMember.workspace.id,
    });
    for (const projectId of [sibling.id, foreign.id]) {
      const feature = await insertTask(projectId, {
        type: "feature",
        title: "Private Feature",
      });
      await insertMilestone(feature.id, { title: "Private milestone" });
    }
    const response = await ctx.read();
    expect(await response.json()).toEqual({
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
    });
    expect((await ctx.read("", "missing")).status).toBe(404);
    expect((await ctx.read("", foreign.id)).status).toBe(404);
  });

  it("uses a bounded number of selects and rejects a changed authorized workspace", async () => {
    const ctx = await setup();
    const database = getDatabase();
    const transaction = database.transaction.bind(database);
    const counts: number[] = [];
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
    const options = { page: 1, limit: 50 };
    try {
      await readReleaseMilestoneLinkCandidates(
        ctx.project.id,
        ctx.workspace.id,
        options,
      );
      const feature = await insertTask(ctx.project.id, { type: "feature" });
      await db.insert(schema.milestoneTable).values(
        Array.from({ length: 25 }, (_, position) => ({
          featureId: feature.id,
          title: `Milestone ${position}`,
          position,
        })),
      );
      await readReleaseMilestoneLinkCandidates(
        ctx.project.id,
        ctx.workspace.id,
        options,
      );
      expect(counts).toEqual([3, 3]);
    } finally {
      spy.mockRestore();
    }
    const elsewhere = await createWorkspaceMember();
    await db
      .update(schema.projectTable)
      .set({ workspaceId: elsewhere.workspace.id })
      .where(eq(schema.projectTable.id, ctx.project.id));
    await expect(
      readReleaseMilestoneLinkCandidates(
        ctx.project.id,
        ctx.workspace.id,
        options,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("new-release milestone candidate access", () => {
  for (const authentication of ["custom-role", "api-key"] as const) {
    it.each([
      [{ task: ["read"] }, 200],
      [{ task: ["update"] }, 403],
      [{ project: ["update"] }, 403],
    ] as [Record<string, string[]>, number][])(
      `${authentication} requires task:read %j`,
      async (permissions, status) => {
        const ctx = await setup(
          authentication === "custom-role" ? "candidate_reader" : "owner",
        );
        const headers: Record<string, string> = {};
        if (authentication === "custom-role") {
          await db.insert(schema.workspaceRoleTable).values({
            workspaceId: ctx.workspace.id,
            role: "candidate_reader",
            permission: JSON.stringify(permissions),
          });
        } else {
          const key = `kaneo_test_${randomUUID()}`;
          await db.insert(schema.apikeyTable).values({
            referenceId: ctx.user.id,
            userId: ctx.user.id,
            key: createHash("sha256").update(key).digest("base64url"),
            name: "Candidate test",
            createdAt: new Date(),
            updatedAt: new Date(),
            permissions: JSON.stringify(permissions),
            enabled: true,
          });
          headers.Authorization = `Bearer ${key}`;
          mockAnonymousSession();
        }
        expect((await ctx.read("", ctx.project.id, headers)).status).toBe(
          status,
        );
      },
    );
  }

  it("rejects anonymous, foreign-workspace and restricted-project access", async () => {
    const ctx = await setup();
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect((await ctx.read()).status).toBe(404);
    mockAnonymousSession();
    expect((await ctx.read()).status).toBe(401);
    const restricted = await createRestrictedWorkspace();
    mockAuthenticatedSession(restricted.restricted);
    expect((await ctx.read("", restricted.alpha.id)).status).toBe(200);
    expect((await ctx.read("", restricted.beta.id)).status).toBe(403);
  });
});
