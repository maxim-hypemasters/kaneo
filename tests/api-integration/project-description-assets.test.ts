import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

const storage = vi.hoisted(() => ({
  deleteS3Object: vi.fn(),
  getPrivateObject: vi.fn(async () => ({
    body: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
    contentLength: 3,
  })),
}));
vi.mock("../../apps/api/src/storage/s3", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/storage/s3")>()),
  deleteS3Object: storage.deleteS3Object,
  getPrivateObject: storage.getPrivateObject,
}));

import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(async () => {
  await resetTestDatabase();
  storage.deleteS3Object.mockReset();
  storage.deleteS3Object.mockResolvedValue(undefined);
  storage.getPrivateObject.mockClear();
  // Presigning needs storage settings but never reaches the endpoint.
  vi.stubEnv("S3_ENDPOINT", "https://storage.example.test");
  vi.stubEnv("S3_BUCKET", "local-test-bucket");
  vi.stubEnv("S3_ACCESS_KEY_ID", "local-test-key");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "local-test-secret");
  vi.stubEnv("S3_KEY_PREFIX", "");
});
afterEach(() => vi.unstubAllEnvs());

const image = (id: string) => `![image](/api/asset/${id})`;

async function setup() {
  const owner = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: owner.workspace.id,
  });
  mockAuthenticatedSession(owner.user);
  const { app } = createApp();
  const request = (path: string, method = "GET", body?: unknown) =>
    app.request(
      `/api/project/${project.id}${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const stage = (names: string[], createdBy = owner.user.id) =>
    db
      .insert(schema.assetTable)
      .values(
        names.map((name) => ({
          workspaceId: owner.workspace.id,
          projectId: project.id,
          createdBy,
          surface: "draft",
          objectKey: `${name}-${randomUUID()}`,
          filename: `${name}.png`,
          mimeType: "image/png",
          size: 10,
        })),
      )
      .returning();
  // Another person in the owner's workspace.
  const colleague = async (role: string) => {
    const member = await createWorkspaceMember({ role });
    await db
      .update(schema.workspaceUserTable)
      .set({ workspaceId: owner.workspace.id })
      .where(eq(schema.workspaceUserTable.userId, member.user.id));
    return member;
  };
  return { owner, project, app, request, stage, colleague };
}

describe("Project description uploads", () => {
  it("stages uploads only with project:edit_details", async () => {
    const ctx = await setup();
    const body = {
      filename: "diagram.png",
      contentType: "image/png",
      size: 12,
      surface: "description",
    };
    const staged = await ctx.request("/description/draft-upload", "POST", body);
    expect(staged.status).toBe(200);
    const { key } = (await staged.json()) as { key: string };
    const [row] = await db
      .select()
      .from(schema.assetTable)
      .where(eq(schema.assetTable.objectKey, key));
    expect(row).toMatchObject({
      projectId: ctx.project.id,
      createdBy: ctx.owner.user.id,
      surface: "draft-pending",
      taskId: null,
      documentId: null,
    });

    const member = await ctx.colleague("member");
    mockAuthenticatedSession(member.user);
    expect(
      (await ctx.request("/description/draft-upload", "POST", body)).status,
    ).toBe(403);
  });

  it("claims referenced uploads on a details save and deletes the ones a later save removes", async () => {
    const ctx = await setup();
    const [kept, dropped, unused] = await ctx.stage([
      "kept",
      "dropped",
      "unused",
    ]);
    const saved = await ctx.request("/details", "PATCH", {
      description: `# Overview\n\n${image(kept!.id)}\n\n${image(dropped!.id)}`,
      draftAssetIds: [kept!.id, dropped!.id, unused!.id],
    });
    expect(saved.status).toBe(200);
    const rows = await db
      .select()
      .from(schema.assetTable)
      .where(
        inArray(schema.assetTable.id, [kept!.id, dropped!.id, unused!.id]),
      );
    const surfaceOf = (id: string) =>
      rows.find((row) => row.id === id)?.surface;
    expect(surfaceOf(kept!.id)).toBe("project-description");
    expect(surfaceOf(dropped!.id)).toBe("project-description");
    // Not in the text, so it stays a draft for the expiry job.
    expect(surfaceOf(unused!.id)).toBe("draft");
    expect(rows.every((row) => !row.taskId && !row.documentId)).toBe(true);

    const trimmed = await ctx.request("/details", "PATCH", {
      description: `# Overview\n\n${image(kept!.id)}`,
    });
    expect(trimmed.status).toBe(200);
    await vi.waitFor(async () => {
      const left = await db
        .select({ id: schema.assetTable.id })
        .from(schema.assetTable)
        .where(inArray(schema.assetTable.id, [kept!.id, dropped!.id]));
      expect(left.map((row) => row.id)).toEqual([kept!.id]);
    });
    expect(storage.deleteS3Object).toHaveBeenCalledWith(dropped!.objectKey);
  });

  it("refuses someone else's staged upload and saves nothing", async () => {
    const ctx = await setup();
    const other = await ctx.colleague("owner");
    const [theirs] = await ctx.stage(["theirs"], other.user.id);
    const response = await ctx.request("/details", "PATCH", {
      description: image(theirs!.id),
      draftAssetIds: [theirs!.id],
    });
    expect(response.status).toBe(400);
    const [project] = await db
      .select({ description: schema.projectTable.description })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.id, ctx.project.id));
    expect(project?.description ?? "").not.toContain(theirs!.id);
    const [row] = await db
      .select({ surface: schema.assetTable.surface })
      .from(schema.assetTable)
      .where(eq(schema.assetTable.id, theirs!.id));
    expect(row?.surface).toBe("draft");
  });

  it("keeps description uploads private on a public project", async () => {
    const ctx = await setup();
    const [asset] = await ctx.stage(["private"]);
    expect(
      (
        await ctx.request("/details", "PATCH", {
          description: image(asset!.id),
          draftAssetIds: [asset!.id],
        })
      ).status,
    ).toBe(200);
    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, ctx.project.id));

    const member = await ctx.colleague("member");
    mockAuthenticatedSession(member.user);
    expect((await ctx.app.request(`/api/asset/${asset!.id}`)).status).toBe(200);

    mockAnonymousSession();
    expect((await ctx.app.request(`/api/asset/${asset!.id}`)).status).toBe(401);
  });

  it("deletes uploads a full project update removes from the description", async () => {
    const ctx = await setup();
    const [asset] = await ctx.stage(["replaced"]);
    await ctx.request("/details", "PATCH", {
      description: image(asset!.id),
      draftAssetIds: [asset!.id],
    });
    const response = await ctx.request("", "PUT", {
      name: ctx.project.name,
      icon: ctx.project.icon ?? "Layout",
      slug: ctx.project.slug,
      description: "No pictures now",
      isPublic: false,
    });
    expect(response.status).toBe(200);
    await vi.waitFor(async () => {
      expect(
        await db
          .select()
          .from(schema.assetTable)
          .where(eq(schema.assetTable.id, asset!.id)),
      ).toHaveLength(0);
    });
  });
});
