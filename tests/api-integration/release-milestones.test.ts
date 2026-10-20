import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { getDatabase, schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { readReleaseMilestones } from "../../apps/api/src/release/read-release-milestones";
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
  const release = await insertRelease(project.id);
  const app = createApp().app;
  mockAuthenticatedSession(member.user);
  return { ...member, project, release, app };
}

async function milestone(
  featureId: string,
  title = "Checkpoint",
  position = 0,
) {
  const [row] = await db
    .insert(schema.milestoneTable)
    .values({ featureId, title, position })
    .returning();
  if (!row) throw new Error("Failed to insert milestone");
  return { id: row.id, featureId, title, position };
}

describe("release milestone metadata", () => {
  it("includes empty definitions from release Features and visible Task/Bug parents, ordered by Feature, position and id", async () => {
    const ctx = await setup();
    const own = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.release.id,
    });
    const second = await milestone(own.id, "Second", 20);
    const first = await milestone(own.id, "First", 10);
    const tied = await milestone(own.id, "Same position", 10);
    const otherRelease = await insertRelease(ctx.project.id);
    const referenced = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: otherRelease.id,
    });
    const referencedMilestone = await milestone(
      referenced.id,
      "Referenced empty milestone",
    );
    // Membership need not have a milestone: all definitions of the parent are returned.
    await insertTask(ctx.project.id, {
      featureId: referenced.id,
      releaseId: ctx.release.id,
    });
    const archivedFeature = await insertTask(ctx.project.id, {
      type: "feature",
      status: "archived",
    });
    const archivedFeatureMilestone = await milestone(
      archivedFeature.id,
      "Visible bug's archived parent",
    );
    await insertTask(ctx.project.id, {
      type: "bug",
      status: "planned",
      featureId: archivedFeature.id,
      releaseId: ctx.release.id,
    });
    const excluded = await insertTask(ctx.project.id, { type: "feature" });
    await milestone(excluded.id, "Archived work only");
    await insertTask(ctx.project.id, {
      featureId: excluded.id,
      releaseId: ctx.release.id,
      status: "archived",
    });
    const unrelated = await insertTask(ctx.project.id, { type: "feature" });
    await milestone(unrelated.id, "Outside release");
    const expected = [
      second,
      first,
      tied,
      referencedMilestone,
      archivedFeatureMilestone,
    ].sort(
      (a, b) =>
        a.featureId.localeCompare(b.featureId) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );

    const response = await ctx.app.request(
      `/api/release/${ctx.release.id}/milestones`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
  });

  it("returns an empty list for an empty release and 404 for a missing release", async () => {
    const ctx = await setup();
    const response = await ctx.app.request(
      `/api/release/${ctx.release.id}/milestones`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(
      (await ctx.app.request("/api/release/missing/milestones")).status,
    ).toBe(404);
  });

  it("never imports another project's Feature definitions through malformed parent references", async () => {
    const ctx = await setup();
    const { project: other } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const feature = await insertTask(other.id, { type: "feature" });
    await milestone(feature.id, "Private foreign metadata");
    // The Feature foreign key is intentionally not a composite project key.
    await insertTask(ctx.project.id, {
      featureId: feature.id,
      releaseId: ctx.release.id,
    });
    const response = await ctx.app.request(
      `/api/release/${ctx.release.id}/milestones`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("keeps a constant number of selects when reading many release Features", async () => {
    const ctx = await setup();
    const selectCounts: number[] = [];
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
          selectCounts.push(select.mock.calls.length);
          select.mockRestore();
        }
      }, options)) as typeof db.transaction);
    try {
      expect(
        await readReleaseMilestones(
          ctx.release.id,
          ctx.project.id,
          ctx.workspace.id,
        ),
      ).toEqual([]);
      for (let index = 0; index < 40; index++) {
        const feature = await insertTask(ctx.project.id, {
          type: "feature",
          releaseId: ctx.release.id,
        });
        await milestone(feature.id, `Milestone ${index}`);
      }
      expect(
        await readReleaseMilestones(
          ctx.release.id,
          ctx.project.id,
          ctx.workspace.id,
        ),
      ).toHaveLength(40);
      // Scope recheck, one batch select, and its correlated EXISTS builder.
      expect(selectCounts).toEqual([3, 3]);
    } finally {
      spy.mockRestore();
    }
  });

  it("rechecks authorized project and workspace before reading milestone metadata", async () => {
    const ctx = await setup();
    const target = await createWorkspaceMember();
    await expect(
      readReleaseMilestones(ctx.release.id, "wrong-project", ctx.workspace.id),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      readReleaseMilestones(ctx.release.id, undefined, ctx.workspace.id),
    ).rejects.toMatchObject({ status: 409 });
    await db
      .update(schema.projectTable)
      .set({ workspaceId: target.workspace.id })
      .where(eq(schema.projectTable.id, ctx.project.id));
    await expect(
      readReleaseMilestones(ctx.release.id, ctx.project.id, ctx.workspace.id),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("release milestone access", () => {
  it.each([
    [{ task: ["read"] }, 200],
    [{ task: ["update"] }, 403],
    [{ project: ["read"] }, 403],
  ] as const)(
    "requires task:read for custom role %j",
    async (permissions, status) => {
      const ctx = await setup("release_milestone_reader");
      await db.insert(schema.workspaceRoleTable).values({
        workspaceId: ctx.workspace.id,
        role: "release_milestone_reader",
        permission: JSON.stringify(permissions),
      });
      expect(
        (await ctx.app.request(`/api/release/${ctx.release.id}/milestones`))
          .status,
      ).toBe(status);
    },
  );

  it.each([
    [{ task: ["read"] }, 200],
    [{ task: ["update"] }, 403],
    [{ project: ["read"] }, 403],
  ] as const)(
    "requires API-key task:read scope %j",
    async (permissions, status) => {
      const ctx = await setup();
      const key = await auth.api.createApiKey({
        body: {
          userId: ctx.user.id,
          name: "Release milestone scope",
          permissions: JSON.parse(JSON.stringify(permissions)),
        },
      });
      mockAnonymousSession();
      expect(
        (
          await ctx.app.request(`/api/release/${ctx.release.id}/milestones`, {
            headers: { "x-api-key": key.key },
          })
        ).status,
      ).toBe(status);
    },
  );

  it("hides another workspace and rejects anonymous callers", async () => {
    const ctx = await setup();
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect(
      (await ctx.app.request(`/api/release/${ctx.release.id}/milestones`))
        .status,
    ).toBe(404);
    mockAnonymousSession();
    expect(
      (await ctx.app.request(`/api/release/${ctx.release.id}/milestones`))
        .status,
    ).toBe(401);
  });

  it("denies project-restricted members access to other projects in their workspace", async () => {
    const ctx = await createRestrictedWorkspace();
    const allowed = await insertRelease(ctx.alpha.id);
    const hidden = await insertRelease(ctx.beta.id);
    mockAuthenticatedSession(ctx.restricted);
    const app = createApp().app;
    expect(
      (await app.request(`/api/release/${allowed.id}/milestones`)).status,
    ).toBe(200);
    expect(
      (await app.request(`/api/release/${hidden.id}/milestones`)).status,
    ).toBe(403);
  });
});
