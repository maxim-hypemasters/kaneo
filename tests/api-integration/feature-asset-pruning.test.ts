import { eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const storage = vi.hoisted(() => ({ deleteS3Object: vi.fn() }));
vi.mock("../../apps/api/src/storage/s3", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/storage/s3")>()),
  deleteS3Object: storage.deleteS3Object,
}));

import db, { schema } from "../../apps/api/src/database";
import { auth } from "../../apps/api/src/auth";
import { createApp } from "../../apps/api/src/index";
import { retryStorageCleanup } from "../../apps/api/src/storage/cleanup-queue";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(async () => {
  await resetTestDatabase();
  storage.deleteS3Object.mockReset();
  storage.deleteS3Object.mockResolvedValue(undefined);
});

async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
    slug: "FP",
  });
  const feature = await insertTask(fixture.project.id, {
    type: "feature",
    title: "Uploads",
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const request = (path: string, method = "GET", body?: unknown) =>
    app.request(
      `/api/feature/${feature.id}${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const insertAsset = async (
    objectKey: string,
    values: Partial<typeof schema.assetTable.$inferInsert> = {},
  ) => {
    const [asset] = await db
      .insert(schema.assetTable)
      .values({
        workspaceId: member.workspace.id,
        projectId: fixture.project.id,
        taskId: feature.id,
        createdBy: member.user.id,
        surface: "description",
        objectKey,
        filename: `${objectKey}.png`,
        mimeType: "image/png",
        size: 10,
        ...values,
      })
      .returning();
    return asset!;
  };
  return { ...member, ...fixture, feature, app, request, insertAsset };
}

const image = (id: string) => `![image](/api/asset/${id})`;

async function remainingAssetIds(ids: string[]) {
  const rows = await db
    .select({ id: schema.assetTable.id })
    .from(schema.assetTable)
    .where(inArray(schema.assetTable.id, ids));
  return rows.map((row) => row.id).sort();
}

async function queuedKeys() {
  const rows = await db.select().from(schema.storageCleanupTable);
  return rows.map((row) => row.objectKey).sort();
}

describe("Feature asset pruning", () => {
  it("keeps uploads removed by a save with keepRemovedAssets and still deletes them by default", async () => {
    const ctx = await setup();
    const kept = await ctx.insertAsset("kept-upload");
    const removed = await ctx.insertAsset("removed-upload");
    const doc = await (
      await ctx.request("/documents", "POST", {
        title: "Notes",
        body: `${image(kept.id)}\n\n${image(removed.id)}`,
      })
    ).json();
    expect(
      (
        await ctx.request(`/documents/${doc.id}`, "PUT", {
          body: image(removed.id),
          expectedRevision: 1,
          keepRemovedAssets: "yes",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx.request(`/documents/${doc.id}`, "PUT", {
          body: image(removed.id),
          expectedRevision: 1,
          keepRemovedAssets: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx.request(`/documents/${doc.id}`, "PUT", {
          body: "",
          expectedRevision: 2,
        })
      ).status,
    ).toBe(200);
    // The default save's cleanup runs after the response; once it has removed
    // its upload, the earlier save would have removed its own as well.
    await vi.waitFor(async () =>
      expect(await remainingAssetIds([removed.id])).toEqual([]),
    );
    expect(await remainingAssetIds([kept.id])).toEqual([kept.id]);
    expect(storage.deleteS3Object).toHaveBeenCalledTimes(1);
    expect(storage.deleteS3Object).toHaveBeenCalledWith("removed-upload");
  });

  it("prunes only this Feature's unreferenced uploads and leaves storage to the cleanup queue", async () => {
    const ctx = await setup();
    const unreferenced = await ctx.insertAsset("unreferenced");
    const inDocument = await ctx.insertAsset("in-document");
    const inUpdate = await ctx.insertAsset("in-update");
    const otherFeature = await insertTask(ctx.project.id, { type: "feature" });
    const ofOtherFeature = await ctx.insertAsset("other-feature", {
      taskId: otherFeature.id,
    });
    const foreign = await createWorkspaceMember({ role: "owner" });
    const foreignProject = await createProjectFixture({
      workspaceId: foreign.workspace.id,
    });
    const foreignFeature = await insertTask(foreignProject.project.id, {
      type: "feature",
    });
    const ofOtherWorkspace = await ctx.insertAsset("other-workspace", {
      workspaceId: foreign.workspace.id,
      projectId: foreignProject.project.id,
      taskId: foreignFeature.id,
      createdBy: foreign.user.id,
    });
    const draft = await ctx.insertAsset("draft", {
      taskId: null,
      surface: "draft",
    });
    expect(
      (
        await ctx.request("/documents", "POST", {
          title: "Still used",
          body: image(inDocument.id),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx.request("/updates", "POST", {
          note: image(inUpdate.id),
          health: "on-track",
        })
      ).status,
    ).toBe(200);
    const all = [
      unreferenced.id,
      inDocument.id,
      inUpdate.id,
      ofOtherFeature.id,
      ofOtherWorkspace.id,
      draft.id,
    ];

    const response = await ctx.request("/assets/prune", "POST", {
      assetIds: [...all, unreferenced.id, "unknownasset"],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deletedAssetIds: [unreferenced.id],
    });
    expect(await remainingAssetIds(all)).toEqual(
      all.filter((id) => id !== unreferenced.id).sort(),
    );
    expect(await queuedKeys()).toEqual(["unreferenced"]);
    expect(storage.deleteS3Object).not.toHaveBeenCalled();
    expect(await retryStorageCleanup()).toEqual({ degraded: false });
    expect(storage.deleteS3Object).toHaveBeenCalledTimes(1);
    expect(storage.deleteS3Object).toHaveBeenCalledWith("unreferenced");
    expect(await queuedKeys()).toEqual([]);
  });

  it("lets a save that references an upload again win over a waiting prune", async () => {
    const ctx = await setup();
    const asset = await ctx.insertAsset("pasted-back");
    const doc = await (
      await ctx.request("/documents", "POST", { title: "Draft", body: "" })
    ).json();
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    // Stands in for a document save, which holds the Feature row while it writes.
    const save = db.transaction(async (tx) => {
      await tx
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, ctx.feature.id))
        .for("update");
      locked.resolve();
      await release.promise;
      await tx
        .update(schema.featureDocumentTable)
        .set({ body: image(asset.id), revision: 2 })
        .where(eq(schema.featureDocumentTable.id, doc.id));
    });
    await locked.promise;
    const prune = ctx.request("/assets/prune", "POST", {
      assetIds: [asset.id],
    });
    try {
      await vi.waitFor(async () => {
        const waiting = await db.execute<{ total: string }>(
          sql`select count(*) as total from pg_stat_activity where wait_event_type = 'Lock' and lower(query) like '%for update%'`,
        );
        expect(Number(waiting.rows[0]?.total)).toBeGreaterThanOrEqual(1);
      });
    } finally {
      release.resolve();
      await save;
    }
    const response = await prune;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deletedAssetIds: [] });
    expect(await remainingAssetIds([asset.id])).toEqual([asset.id]);
  });

  it("requires task:update and project access, hides other Features and validates the id list", async () => {
    const ctx = await setup();
    const asset = await ctx.insertAsset("protected");
    const prune = (body: unknown, headers?: Record<string, string>) =>
      ctx.app.request(
        `/api/feature/${ctx.feature.id}/assets/prune`,
        jsonRequest("POST", body, headers),
      );

    expect((await prune({ assetIds: [] })).status).toBe(400);
    expect(
      (
        await prune({
          assetIds: Array.from({ length: 101 }, (_, index) => `id${index}`),
        })
      ).status,
    ).toBe(400);
    expect((await prune({ assetIds: [asset.id], extra: true })).status).toBe(
      400,
    );
    expect((await prune({})).status).toBe(400);
    const task = await insertTask(ctx.project.id);
    expect(
      (
        await ctx.app.request(
          `/api/feature/${task.id}/assets/prune`,
          jsonRequest("POST", { assetIds: [asset.id] }),
        )
      ).status,
    ).toBe(404);

    const restricted = await createWorkspaceMember();
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: ctx.workspace.id,
      userId: restricted.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    await restrictToProjects(ctx.workspace.id, restricted.user.id, []);
    mockAuthenticatedSession(restricted.user);
    expect((await prune({ assetIds: [asset.id] })).status).toBe(403);

    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect((await prune({ assetIds: [asset.id] })).status).toBe(404);

    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
    const { key } = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Read only",
        permissions: { task: ["read"] },
      },
    });
    expect(
      (await prune({ assetIds: [asset.id] }, { "x-api-key": key })).status,
    ).toBe(403);
    expect(await remainingAssetIds([asset.id])).toEqual([asset.id]);
  });
});
