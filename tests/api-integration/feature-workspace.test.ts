import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { auth } from "../../apps/api/src/auth";
import moveTask from "../../apps/api/src/task/controllers/move-task";
import { deleteOrphanedAssets } from "../../apps/api/src/storage/cleanup-assets";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";
import * as events from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { redactInaccessibleActivity } from "../../apps/api/src/activity/redaction/redact-inaccessible-activity";
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
    slug: "FW",
  });
  const feature = await insertTask(fixture.project.id, {
    type: "feature",
    title: "Knowledge",
  });
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({ featureId: feature.id, title: "Delivery", position: 0 })
    .returning();
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const request = (path = "", method = "GET", body?: unknown) =>
    app.request(
      `/api/feature/${feature.id}${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  return {
    ...member,
    ...fixture,
    feature,
    milestone: milestone!,
    app,
    request,
  };
}

describe("Feature workspace", () => {
  it("provides empty bounded collections and rejects non-Feature identities", async () => {
    const ctx = await setup();
    expect(await (await ctx.request("/updates/latest")).json()).toBeNull();
    const docs = await (await ctx.request("/documents")).json();
    expect(docs).toEqual({
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
    });
    const task = await insertTask(ctx.project.id);
    expect(
      (await ctx.app.request(`/api/feature/${task.id}/documents`)).status,
    ).toBe(404);
    expect((await ctx.request("/activity?limit=101")).status).toBe(400);
  });
  it("creates, searches, renames and revision-locks documents; deletion cascades with Feature", async () => {
    const ctx = await setup();
    const first = await ctx.request("/documents", "POST", {
      title: "Architecture",
      body: "# Header\n\n| A | B |\n| - | - |\n| 1 | 2 |",
    });
    expect(first.status).toBe(200);
    const doc = await first.json();
    expect(doc).toMatchObject({
      featureId: ctx.feature.id,
      title: "Architecture",
      revision: 1,
      createdBy: ctx.user.id,
      createdByName: ctx.user.name,
    });
    await ctx.request("/documents", "POST", { title: "Other" });
    const page = await (
      await ctx.request("/documents?search=Architect&limit=1")
    ).json();
    expect(page.pagination.total).toBe(1);
    expect(page.data[0].body).toBeUndefined();
    expect(
      (
        await ctx.request(`/documents/${doc.id}`, "PUT", {
          title: "System architecture",
          expectedRevision: 1,
        })
      ).status,
    ).toBe(200);
    const conflict = await ctx.request(`/documents/${doc.id}`, "PUT", {
      body: "lost",
      expectedRevision: 1,
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "DOCUMENT_CONFLICT" });
    expect(
      await (await ctx.request(`/documents/${doc.id}`)).json(),
    ).toMatchObject({
      title: "System architecture",
      body: doc.body,
      revision: 2,
    });
    await db
      .delete(schema.taskTable)
      .where(eq(schema.taskTable.id, ctx.feature.id));
    expect(await db.select().from(schema.featureDocumentTable)).toHaveLength(0);
  });
  it("publishes server snapshots with unchanged archived progress rules and immutable previous totals", async () => {
    const ctx = await setup();
    const one = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      milestoneId: ctx.milestone.id,
      status: "done",
      columnId: ctx.columns.done.id,
    });
    await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      milestoneId: ctx.milestone.id,
      type: "bug",
      status: "archived",
    });
    const first = await (
      await ctx.request("/updates", "POST", {
        note: "First report",
        health: "on-track",
      })
    ).json();
    expect(first.eventData.milestones[0]).toMatchObject({
      total: 2,
      completed: 1,
      previousTotal: null,
      previousCompleted: null,
    });
    await db
      .update(schema.milestoneTable)
      .set({ title: "Renamed" })
      .where(eq(schema.milestoneTable.id, ctx.milestone.id));
    await db
      .update(schema.taskTable)
      .set({ status: "to-do", columnId: ctx.columns.todo.id })
      .where(eq(schema.taskTable.id, one.id));
    const second = await (
      await ctx.request("/updates", "POST", {
        note: "Second report",
        health: "at-risk",
      })
    ).json();
    expect(second.eventData.milestones[0]).toMatchObject({
      title: "Renamed",
      total: 2,
      completed: 0,
      previousTotal: 2,
      previousCompleted: 1,
    });
    const edited = await (
      await ctx.request(`/updates/${first.id}`, "PUT", {
        note: "Edited",
        health: "off-track",
      })
    ).json();
    expect(edited.eventData.milestones[0]).toMatchObject({
      title: "Delivery",
      completed: 1,
      previousCompleted: null,
    });
    expect(
      (
        await ctx.request("/updates", "POST", {
          note: "Forge",
          health: "on-track",
          milestones: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx.app.request(
          "/api/activity/create",
          jsonRequest("POST", {
            taskId: ctx.feature.id,
            type: "feature_update",
            message: "Forged",
            eventData: {},
          }),
        )
      ).status,
    ).toBe(400);
    await ctx.request(`/updates/${second.id}`, "DELETE");
    expect(await (await ctx.request("/updates/latest")).json()).toMatchObject({
      id: first.id,
      content: "Edited",
    });
  });
  it("resolves an older official update directly without scanning Activity and isolates its owner", async () => {
    const ctx = await setup();
    const report = await (
      await ctx.request("/updates", "POST", {
        note: "Older report",
        health: "on-track",
      })
    ).json();
    await db.insert(schema.activityTable).values(
      Array.from({ length: 35 }, (_, index) => ({
        taskId: ctx.feature.id,
        type: "comment",
        userId: ctx.user.id,
        content: `Newer ${index}`,
        createdAt: new Date(Date.now() + 1000 + index),
      })),
    );
    expect(
      (await (await ctx.request("/activity?limit=30")).json()).data.some(
        (row: { id: string }) => row.id === report.id,
      ),
    ).toBe(false);
    expect(
      await (await ctx.request(`/updates/${report.id}`)).json(),
    ).toMatchObject({ id: report.id, content: "Older report" });
    const otherFeature = await insertTask(ctx.project.id, { type: "feature" });
    expect(
      (
        await ctx.app.request(
          `/api/feature/${otherFeature.id}/updates/${report.id}`,
        )
      ).status,
    ).toBe(404);
    const [comment] = await db
      .select()
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, ctx.feature.id),
          eq(schema.activityTable.type, "comment"),
        ),
      )
      .limit(1);
    expect((await ctx.request(`/updates/${comment!.id}`)).status).toBe(404);
    const destination = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    await moveTask({
      taskId: ctx.feature.id,
      destinationProjectId: destination.project.id,
      currentUserId: ctx.user.id,
    });
    const viewer = await createWorkspaceMember();
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: ctx.workspace.id,
      userId: viewer.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    await restrictToProjects(ctx.workspace.id, viewer.user.id, [
      destination.project.id,
    ]);
    mockAuthenticatedSession(viewer.user);
    expect(
      await (await ctx.request(`/updates/${report.id}`)).json(),
    ).toMatchObject({
      id: report.id,
      content: null,
      eventData: { redacted: true, milestones: [] },
    });
  });
  it("serializes simultaneous publications against their correct previous report", async () => {
    const ctx = await setup();
    await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      milestoneId: ctx.milestone.id,
    });
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const holder = db.transaction(async (tx) => {
      await tx
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, ctx.feature.id))
        .for("update");
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const pending = Promise.all([
      ctx.request("/updates", "POST", { note: "A", health: "on-track" }),
      ctx.request("/updates", "POST", { note: "B", health: "at-risk" }),
    ]);
    try {
      await vi.waitFor(async () => {
        const waiting = await db.execute<{ total: string }>(
          sql`select count(*) as total from pg_stat_activity where wait_event_type = 'Lock' and lower(query) like '%for update%'`,
        );
        expect(Number(waiting.rows[0]?.total)).toBeGreaterThanOrEqual(2);
      });
    } finally {
      release.resolve();
      await holder;
    }
    const replies = await pending;
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    const reports = (await (await ctx.request("/activity")).json()).data;
    expect(reports[0].eventData.milestones[0].previousTotal).toBe(1);
    expect(reports[1].eventData.milestones[0].previousTotal).toBeNull();
  });
  it("paginates compact Issues after archived/milestone filters and includes Done/no-milestone work", async () => {
    const ctx = await setup();
    await insertTask(ctx.project.id, {
      title: "Done work",
      featureId: ctx.feature.id,
      milestoneId: ctx.milestone.id,
      status: "done",
      columnId: ctx.columns.done.id,
    });
    await insertTask(ctx.project.id, {
      title: "Bug work",
      featureId: ctx.feature.id,
      type: "bug",
      columnId: ctx.columns.todo.id,
    });
    await insertTask(ctx.project.id, {
      title: "Archived work",
      featureId: ctx.feature.id,
      status: "archived",
    });
    const first = await (await ctx.request("/issues?limit=1")).json();
    expect(first.pagination).toMatchObject({ total: 2, totalPages: 2 });
    expect(first.data[0]).toMatchObject({
      title: "Bug work",
      type: "bug",
      projectSlug: "FW",
    });
    expect(
      first.groups.find((g: { slug: string }) => g.slug === "done").total,
    ).toBe(1);
    expect(
      (
        await (
          await ctx.request("/issues?milestoneId=none&archived=include")
        ).json()
      ).pagination.total,
    ).toBe(2);
    expect(
      (
        await (
          await ctx.request(`/issues?milestoneId=${ctx.milestone.id}`)
        ).json()
      ).data[0].title,
    ).toBe("Done work");
    expect(
      (await (await ctx.request("/issues?search=FW-&archived=only")).json())
        .data[0].title,
    ).toBe("Archived work");
  });
  it("enforces ownership, project isolation, and post-commit events", async () => {
    const ctx = await setup();
    const update = await (
      await ctx.request("/updates", "POST", {
        note: "Author",
        health: "on-track",
      })
    ).json();
    const doc = await (
      await ctx.request("/documents", "POST", { title: "Private" })
    ).json();
    const other = await createWorkspaceMember({ role: "owner" });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: ctx.workspace.id,
      userId: other.user.id,
      role: "owner",
      joinedAt: new Date(),
    });
    mockAuthenticatedSession(other.user);
    expect((await ctx.request(`/updates/${update.id}`, "DELETE")).status).toBe(
      403,
    );
    expect(
      (
        await ctx.request(`/updates/${update.id}`, "PUT", {
          note: "Not author",
          health: "at-risk",
        })
      ).status,
    ).toBe(403);
    const foreign = await insertTask(
      (await createProjectFixture({ workspaceId: other.workspace.id })).project
        .id,
      { type: "feature" },
    );
    expect(
      (await ctx.app.request(`/api/feature/${foreign.id}/documents/${doc.id}`))
        .status,
    ).toBe(404);
    const publish = vi
      .spyOn(events, "publishEvent")
      .mockImplementation(async (type, payload) => {
        if (type === "feature.document.created") {
          const data = payload as { resourceId: string };
          expect(
            await db.query.featureDocumentTable.findFirst({
              where: eq(schema.featureDocumentTable.id, data.resourceId),
            }),
          ).toBeDefined();
        }
      });
    expect(
      (await ctx.request("/documents", "POST", { title: "Committed" })).status,
    ).toBe(200);
    expect(publish).toHaveBeenCalledWith(
      "feature.document.created",
      expect.objectContaining({
        projectId: ctx.project.id,
        featureId: ctx.feature.id,
      }),
    );
  });
  it("redacts historical update snapshots from inaccessible former projects", async () => {
    const ctx = await setup();
    const other = await createWorkspaceMember();
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: ctx.workspace.id,
      userId: other.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    await restrictToProjects(ctx.workspace.id, other.user.id, []);
    const rows = await redactInaccessibleActivity(other.user.id, [
      {
        taskId: ctx.feature.id,
        type: "feature_update",
        content: "private old note",
        eventData: {
          projectId: ctx.project.id,
          health: "on-track",
          milestones: [{ title: "Private" }],
        },
      },
    ]);
    expect(rows[0]).toMatchObject({
      content: null,
      eventData: { redacted: true, milestones: [], health: null },
    });
    expect(
      await db
        .select()
        .from(schema.featureDocumentTable)
        .where(and(eq(schema.featureDocumentTable.featureId, ctx.feature.id))),
    ).toHaveLength(0);
  });
  it("claims staged document/report assets, preserves shared references and follows Feature moves/archive", async () => {
    const ctx = await setup();
    const [asset] = await db
      .insert(schema.assetTable)
      .values({
        workspaceId: ctx.workspace.id,
        projectId: ctx.project.id,
        createdBy: ctx.user.id,
        surface: "draft",
        objectKey: "feature-shared-file",
        filename: "diagram.png",
        mimeType: "image/png",
        size: 10,
      })
      .returning();
    const markdown = `![diagram](/api/asset/${asset!.id})`;
    const saved = await ctx.request("/documents", "POST", {
      title: "Shared file",
      body: markdown,
      draftAssetIds: [asset!.id],
    });
    expect(saved.status).toBe(200);
    const doc = await saved.json();
    expect(
      await db.query.assetTable.findFirst({
        where: eq(schema.assetTable.id, asset!.id),
      }),
    ).toMatchObject({ taskId: ctx.feature.id, surface: "description" });
    await ctx.request("/updates", "POST", {
      note: markdown,
      health: "on-track",
    });
    await deleteOrphanedAssets(markdown, "", { taskId: ctx.feature.id });
    expect(
      await db.query.assetTable.findFirst({
        where: eq(schema.assetTable.id, asset!.id),
      }),
    ).toBeDefined();
    const destination = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    await moveTask({
      taskId: ctx.feature.id,
      destinationProjectId: destination.project.id,
      currentUserId: ctx.user.id,
    });
    expect(
      await db.query.assetTable.findFirst({
        where: eq(schema.assetTable.id, asset!.id),
      }),
    ).toMatchObject({
      projectId: destination.project.id,
      taskId: ctx.feature.id,
    });
    await db
      .update(schema.taskTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.taskTable.id, ctx.feature.id));
    expect((await ctx.request(`/documents/${doc.id}`)).status).toBe(200);
    expect((await (await ctx.request("/updates/latest")).json()).content).toBe(
      markdown,
    );
    const [unclaimed] = await db
      .insert(schema.assetTable)
      .values({
        workspaceId: ctx.workspace.id,
        projectId: destination.project.id,
        createdBy: ctx.user.id,
        surface: "draft",
        objectKey: "unclaimed-after-conflict",
        filename: "draft.png",
        mimeType: "image/png",
        size: 10,
      })
      .returning();
    expect(
      (
        await ctx.request(`/documents/${doc.id}`, "PUT", {
          expectedRevision: 99,
          body: `/api/asset/${unclaimed!.id}`,
          draftAssetIds: [unclaimed!.id],
        })
      ).status,
    ).toBe(409);
    expect(
      await db.query.assetTable.findFirst({
        where: eq(schema.assetTable.id, unclaimed!.id),
      }),
    ).toMatchObject({ taskId: null, surface: "draft" });
  });
  it("enforces feature read/update/delete scopes for API keys and workspace visibility", async () => {
    const ctx = await setup();
    const doc = await (
      await ctx.request("/documents", "POST", { title: "Protected" })
    ).json();
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
    const { key } = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Read only",
        permissions: { feature: ["read"] },
      },
    });
    const headers = { "x-api-key": key };
    expect(
      (
        await ctx.app.request(`/api/feature/${ctx.feature.id}/issues`, {
          headers,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx.app.request(
          `/api/feature/${ctx.feature.id}/documents`,
          jsonRequest("POST", { title: "Forbidden" }, headers),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await ctx.app.request(
          `/api/feature/${ctx.feature.id}/documents/${doc.id}`,
          { method: "DELETE", headers },
        )
      ).status,
    ).toBe(403);
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect((await ctx.request("/documents")).status).toBe(404);
    expect((await ctx.request("/activity")).status).toBe(404);
  });
});
