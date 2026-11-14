import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const storage = vi.hoisted(() => ({ deleteS3Object: vi.fn() }));
vi.mock("../../apps/api/src/storage/s3", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/storage/s3")>()),
  deleteS3Object: storage.deleteS3Object,
}));

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

beforeEach(async () => {
  await resetTestDatabase();
  storage.deleteS3Object.mockReset();
  storage.deleteS3Object.mockResolvedValue(undefined);
});

type Page = { id: string; parentId: string | null; position: number };

async function setup(role = "owner") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
    slug: "PD",
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const request = (path: string, method = "GET", body?: unknown) =>
    app.request(
      `/api/project-document${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const create = async (title: string, parentId?: string) => {
    const response = await request(`/project/${fixture.project.id}`, "POST", {
      title,
      ...(parentId ? { parentId } : {}),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as Page & { title: string };
  };
  const tree = async () =>
    (await (await request(`/project/${fixture.project.id}`)).json()) as {
      pages: (Page & { title: string })[];
      features: {
        id: string;
        title: string;
        documents: { id: string; title: string }[];
      }[];
    };
  // "parent:position" for every page, keyed by title.
  const layout = async () =>
    Object.fromEntries(
      (await tree()).pages.map((page) => [
        page.title,
        `${page.parentId ?? "-"}:${page.position}`,
      ]),
    );
  return { ...member, ...fixture, app, request, create, tree, layout };
}

describe("Project documents", () => {
  it("lists nested pages and active Features' documents without bodies", async () => {
    const ctx = await setup();
    const guide = await ctx.create("Guide");
    const intro = await ctx.create("Intro", guide.id);
    await ctx.create("Roadmap");
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Search",
    });
    const archived = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Old",
    });
    await db
      .update(schema.taskTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.taskTable.id, archived.id));
    await db.insert(schema.featureDocumentTable).values([
      { featureId: feature.id, title: "Spec", body: "secret body" },
      { featureId: archived.id, title: "Hidden", body: "" },
    ]);

    const result = await ctx.tree();
    expect(await ctx.layout()).toEqual({
      Guide: "-:0",
      Roadmap: "-:1",
      Intro: `${guide.id}:0`,
    });
    expect(
      result.pages.find((page) => page.id === intro.id),
    ).not.toHaveProperty("body");
    expect(result.features).toEqual([
      {
        id: feature.id,
        number: feature.number,
        title: "Search",
        documents: [
          expect.objectContaining({
            title: "Spec",
            updatedAt: expect.any(String),
          }),
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret body");
  });

  it("saves with revision locking", async () => {
    const ctx = await setup();
    const page = await ctx.create("Notes");
    const saved = await ctx.request(`/${page.id}`, "PUT", {
      title: "Meeting notes",
      body: "Agenda",
      expectedRevision: 1,
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      title: "Meeting notes",
      body: "Agenda",
      revision: 2,
      updatedByName: ctx.user.name,
    });
    const conflict = await ctx.request(`/${page.id}`, "PUT", {
      body: "lost",
      expectedRevision: 1,
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "DOCUMENT_CONFLICT" });
    expect(await (await ctx.request(`/${page.id}`)).json()).toMatchObject({
      body: "Agenda",
      revision: 2,
    });
  });

  it("reorders, nests and lifts pages, keeping sibling positions dense", async () => {
    const ctx = await setup();
    const a = await ctx.create("A");
    const b = await ctx.create("B");
    await ctx.create("C");

    expect(
      (await ctx.request(`/${a.id}/move`, "PUT", { parentId: null, index: 2 }))
        .status,
    ).toBe(200);
    expect(await ctx.layout()).toEqual({ B: "-:0", C: "-:1", A: "-:2" });

    const nested = await ctx.request(`/${a.id}/move`, "PUT", {
      parentId: b.id,
      index: 0,
    });
    expect(await nested.json()).toMatchObject({ parentId: b.id, position: 0 });
    expect(await ctx.layout()).toEqual({ B: "-:0", C: "-:1", A: `${b.id}:0` });

    await ctx.request(`/${a.id}/move`, "PUT", { parentId: null, index: 0 });
    expect(await ctx.layout()).toEqual({ A: "-:0", B: "-:1", C: "-:2" });
  });

  it("refuses to move a page into itself, its sub-pages or another project", async () => {
    const ctx = await setup();
    const parent = await ctx.create("Parent");
    const child = await ctx.create("Child", parent.id);
    const grandchild = await ctx.create("Grandchild", child.id);
    for (const target of [parent.id, grandchild.id])
      expect(
        (
          await ctx.request(`/${parent.id}/move`, "PUT", {
            parentId: target,
            index: 0,
          })
        ).status,
      ).toBe(400);

    const other = await createProjectFixture({
      workspaceId: ctx.workspace.id,
      slug: "OT",
    });
    const [foreign] = await db
      .insert(schema.projectDocumentTable)
      .values({ projectId: other.project.id, title: "Elsewhere" })
      .returning();
    expect(
      (
        await ctx.request(`/${child.id}/move`, "PUT", {
          parentId: foreign!.id,
          index: 0,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await ctx.request(`/project/${ctx.project.id}`, "POST", {
          title: "Stray",
          parentId: foreign!.id,
        })
      ).status,
    ).toBe(404);
  });

  it("deletes a page with its sub-pages and their uploads", async () => {
    const ctx = await setup();
    const parent = await ctx.create("Parent");
    const child = await ctx.create("Child", parent.id);
    const sibling = await ctx.create("Sibling");
    const [asset] = await db
      .insert(schema.assetTable)
      .values({
        workspaceId: ctx.workspace.id,
        projectId: ctx.project.id,
        documentId: child.id,
        createdBy: ctx.user.id,
        surface: "document",
        objectKey: "doc-upload",
        filename: "doc.png",
        mimeType: "image/png",
        size: 10,
      })
      .returning();

    const deleted = await ctx.request(`/${parent.id}`, "DELETE");
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ id: parent.id, deletedCount: 2 });
    expect(await ctx.layout()).toEqual({ Sibling: "-:0" });
    expect(
      await db
        .select()
        .from(schema.assetTable)
        .where(eq(schema.assetTable.id, asset!.id)),
    ).toHaveLength(0);
    expect((await ctx.request(`/${sibling.id}`)).status).toBe(200);
  });

  it("claims staged uploads on save and deletes the ones a save removes", async () => {
    const ctx = await setup();
    const page = await ctx.create("Uploads");
    const [kept, dropped] = await db
      .insert(schema.assetTable)
      .values(
        ["kept", "dropped"].map((objectKey) => ({
          workspaceId: ctx.workspace.id,
          projectId: ctx.project.id,
          createdBy: ctx.user.id,
          surface: "draft",
          objectKey,
          filename: `${objectKey}.png`,
          mimeType: "image/png",
          size: 10,
        })),
      )
      .returning();
    const image = (id: string) => `![image](/api/asset/${id})`;
    const first = await ctx.request(`/${page.id}`, "PUT", {
      body: `${image(kept!.id)} ${image(dropped!.id)}`,
      expectedRevision: 1,
      draftAssetIds: [kept!.id, dropped!.id],
    });
    expect(first.status).toBe(200);
    const claimed = await db
      .select()
      .from(schema.assetTable)
      .where(inArray(schema.assetTable.id, [kept!.id, dropped!.id]));
    expect(claimed.map((asset) => [asset.documentId, asset.surface])).toEqual([
      [page.id, "document"],
      [page.id, "document"],
    ]);

    await ctx.request(`/${page.id}`, "PUT", {
      body: image(kept!.id),
      expectedRevision: 2,
      keepRemovedAssets: true,
    });
    const pruned = await ctx.request(`/${page.id}/assets/prune`, "POST", {
      assetIds: [kept!.id, dropped!.id],
    });
    expect(await pruned.json()).toEqual({ deletedAssetIds: [dropped!.id] });
  });

  it("lets viewers read but not change pages", async () => {
    const owner = await setup();
    const page = await owner.create("Handbook");
    const viewer = await createWorkspaceMember({ role: "viewer" });
    await db
      .update(schema.workspaceUserTable)
      .set({ workspaceId: owner.workspace.id })
      .where(eq(schema.workspaceUserTable.userId, viewer.user.id));
    mockAuthenticatedSession(viewer.user);

    expect((await owner.request(`/project/${owner.project.id}`)).status).toBe(
      200,
    );
    expect((await owner.request(`/${page.id}`)).status).toBe(200);
    expect(
      (
        await owner.request(`/project/${owner.project.id}`, "POST", {
          title: "Nope",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await owner.request(`/${page.id}`, "PUT", {
          title: "Nope",
          expectedRevision: 1,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await owner.request(`/${page.id}/move`, "PUT", {
          parentId: null,
          index: 0,
        })
      ).status,
    ).toBe(403);
    expect((await owner.request(`/${page.id}`, "DELETE")).status).toBe(403);
  });

  it("hides pages from people outside the workspace", async () => {
    const owner = await setup();
    const page = await owner.create("Private");
    const outsider = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(outsider.user);

    for (const response of [
      await owner.request(`/project/${owner.project.id}`),
      await owner.request(`/${page.id}`),
      await owner.request(`/${page.id}`, "DELETE"),
    ])
      expect([403, 404]).toContain(response.status);
    expect(
      JSON.stringify(await (await owner.request(`/${page.id}`)).json()),
    ).not.toContain("Private");
  });
});
