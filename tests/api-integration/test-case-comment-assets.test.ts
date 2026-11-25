import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { S3Client } from "../../apps/api/node_modules/@aws-sdk/client-s3";
import db, { schema } from "../../apps/api/src/database";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import {
  addMember,
  createCommentFixture,
} from "./helpers/test-case/comment-fixture";

const file = { filename: "shot.png", contentType: "image/png", size: 12 };

beforeEach(async () => {
  await resetTestDatabase();
  vi.stubEnv("S3_ENDPOINT", "https://storage.example.test");
  vi.stubEnv("S3_BUCKET", "local-test-bucket");
  vi.stubEnv("S3_ACCESS_KEY_ID", "local-test-key");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "local-test-secret");
  vi.stubEnv("S3_KEY_PREFIX", "");
  vi.stubEnv("KANEO_API_URL", "https://kaneo.example/api");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type Ctx = Awaited<ReturnType<typeof createCommentFixture>>;

// Runs the whole upload against a storage that reports the file as stored.
async function upload(ctx: Ctx) {
  vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
    ContentLength: file.size,
    ContentType: file.contentType,
  } as never);
  const staged = await ctx.request("PUT", "/comment-upload", file);
  expect(staged.status).toBe(200);
  const { key } = (await staged.json()) as { key: string };
  const finalized = await ctx.request("POST", "/comment-upload/finalize", {
    ...file,
    key,
  });
  expect(finalized.status).toBe(200);
  return { key, ...((await finalized.json()) as { id: string; url: string }) };
}

const assets = () => db.select().from(schema.assetTable);
const queuedKeys = async () =>
  (await db.select().from(schema.storageCleanupTable)).map(
    (row) => row.objectKey,
  );
const post = async (ctx: Ctx, content: string) =>
  (await (await ctx.request("POST", "/comments", { content })).json()) as {
    id: string;
  };

describe("test case comment uploads", () => {
  it("stores an upload under the test case as a private comment asset", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession(ctx.author.user);
    const asset = await upload(ctx);

    expect(asset.key).toContain(
      `workspace/${ctx.author.workspace.id}/project/${ctx.project.id}/test-case/${ctx.testCase.id}/comments/`,
    );
    expect(asset.url).toBe(`https://kaneo.example/api/asset/${asset.id}`);
    expect(await assets()).toMatchObject([
      {
        id: asset.id,
        testCaseId: ctx.testCase.id,
        taskId: null,
        projectId: ctx.project.id,
        workspaceId: ctx.author.workspace.id,
        surface: "comment",
        kind: "image",
        objectKey: asset.key,
        createdBy: ctx.author.user.id,
      },
    ]);

    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, ctx.project.id));
    mockAnonymousSession();
    expect((await ctx.app.request(`/api/asset/${asset.id}`)).status).toBe(401);
    mockAuthenticatedSession((await createWorkspaceMember()).user);
    expect((await ctx.app.request(`/api/asset/${asset.id}`)).status).toBe(404);
  });

  it("needs test_case:update and a key issued for this test case", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession(ctx.author.user);
    const { key } = await upload(ctx);
    const [other] = await db
      .insert(schema.testCaseTable)
      .values({ projectId: ctx.project.id, title: "Other" })
      .returning();
    const foreign = await ctx.app.request(
      `/api/test-case/${other!.id}/comment-upload/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...file, key }),
      },
    );
    expect(foreign.status).toBe(400);
    expect(await assets()).toHaveLength(1);

    mockAuthenticatedSession(
      await addMember(ctx.author.workspace.id, "viewer"),
    );
    expect((await ctx.request("PUT", "/comment-upload", file)).status).toBe(
      403,
    );
    expect(
      (await ctx.request("POST", "/comment-upload/finalize", { ...file, key }))
        .status,
    ).toBe(403);
  });

  it("deletes an upload once no comment references it", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession(ctx.author.user);
    const asset = await upload(ctx);
    const image = `![shot](${asset.url})`;
    const first = await post(ctx, `Before ${image}`);
    const second = await post(ctx, `Same file ${image}`);

    // Still used by the second comment.
    await ctx.request("PATCH", `/comments/${first.id}`, { content: "Before" });
    expect(await assets()).toHaveLength(1);
    expect(await queuedKeys()).toEqual([]);

    await ctx.request("DELETE", `/comments/${second.id}`);
    expect(await assets()).toHaveLength(0);
    expect(await queuedKeys()).toEqual([asset.key]);
  });

  it("queues the stored files when the test case is deleted", async () => {
    const ctx = await createCommentFixture("admin");
    mockAuthenticatedSession(ctx.author.user);
    const asset = await upload(ctx);
    await post(ctx, `![shot](${asset.url})`);

    expect((await ctx.request("DELETE")).status).toBe(200);
    expect(await assets()).toHaveLength(0);
    expect(await queuedKeys()).toEqual([asset.key]);
  });
});
