import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { auth } from "../../apps/api/src/auth";
import { createApp } from "../../apps/api/src/index";
import updateTaskDescription from "../../apps/api/src/task/controllers/update-task-description";
import {
  finalizeStagedTaskAsset,
  stageTaskAssetUpload,
} from "../../apps/api/src/task/controllers/stage-task-asset";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const effects = vi.hoisted(() => ({
  publish: vi.fn(),
  presign: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/events")>()),
  publishEvent: effects.publish,
}));
vi.mock("../../apps/api/src/storage/s3", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/storage/s3")>()),
  createTaskImageUploadUrl: effects.presign,
  verifyTaskAssetUpload: effects.verify,
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  effects.publish.mockResolvedValue(undefined);
  effects.presign.mockResolvedValue({
    key: "private-draft",
    uploadUrl: "https://example.test/upload",
    headers: {},
  });
  effects.verify.mockResolvedValue({ size: 12, contentType: "image/png" });
});

async function setup(
  role = "owner",
  type: "task" | "bug" | "feature" = "task",
) {
  const { user, workspace } = await createWorkspaceMember({ role });
  const { project } = await createProjectFixture({ workspaceId: workspace.id });
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId: project.id,
      title: "Document",
      description: "Original",
      type,
      ...(type === "feature"
        ? { status: null, columnId: null, priority: null }
        : {}),
    })
    .returning();
  mockAuthenticatedSession(user);
  return { user, workspace, project, task: task!, app: createApp().app };
}

async function draftAsset(
  ctx: Awaited<ReturnType<typeof setup>>,
  values: Partial<typeof schema.assetTable.$inferInsert> = {},
) {
  const [asset] = await db
    .insert(schema.assetTable)
    .values({
      workspaceId: ctx.workspace.id,
      projectId: ctx.project.id,
      createdBy: ctx.user.id,
      surface: "draft",
      objectKey: `draft-${Math.random()}`,
      filename: "image.png",
      mimeType: "image/png",
      size: 12,
      ...values,
    })
    .returning();
  return asset!;
}

function put(ctx: Awaited<ReturnType<typeof setup>>, body: unknown) {
  return ctx.app.request(`/api/task/description/${ctx.task.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

it("saves a reviewed description and atomically claims only referenced staged uploads", async () => {
  const ctx = await setup();
  const linked = await draftAsset(ctx);
  const unused = await draftAsset(ctx);
  const response = await put(ctx, {
    description: `![image](/api/asset/${linked.id})`,
    expectedDescription: "Original",
    draftAssetIds: [linked.id, linked.id, unused.id],
  });
  expect(response.status).toBe(200);
  expect(
    await db.query.assetTable.findFirst({
      where: eq(schema.assetTable.id, linked.id),
    }),
  ).toMatchObject({ taskId: ctx.task.id, surface: "description" });
  expect(
    await db.query.assetTable.findFirst({
      where: eq(schema.assetTable.id, unused.id),
    }),
  ).toMatchObject({ taskId: null, surface: "draft" });
  expect(effects.publish).toHaveBeenCalledWith(
    "task.description_changed",
    expect.objectContaining({
      taskId: ctx.task.id,
      oldDescription: "Original",
    }),
  );
});

it("returns a coded conflict without claiming uploads or publishing activity", async () => {
  const ctx = await setup();
  const asset = await draftAsset(ctx);
  const response = await put(ctx, {
    description: `/api/asset/${asset.id}`,
    expectedDescription: "Outdated",
    draftAssetIds: [asset.id],
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "DESCRIPTION_CONFLICT" });
  expect(
    await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, ctx.task.id),
    }),
  ).toMatchObject({ description: "Original" });
  expect(
    await db.query.assetTable.findFirst({
      where: eq(schema.assetTable.id, asset.id),
    }),
  ).toMatchObject({ taskId: null, surface: "draft" });
  expect(effects.publish).not.toHaveBeenCalled();
});

it("serializes concurrent editors so exactly one Save succeeds", async () => {
  const ctx = await setup();
  const responses = await Promise.all([
    put(ctx, { description: "Editor A", expectedDescription: "Original" }),
    put(ctx, { description: "Editor B", expectedDescription: "Original" }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect(effects.publish).toHaveBeenCalledTimes(1);
});

it("keeps legacy callers compatible and compares empty saved content consistently", async () => {
  const ctx = await setup();
  expect((await put(ctx, { description: "" })).status).toBe(200);
  expect(
    (await put(ctx, { description: "New", expectedDescription: "" })).status,
  ).toBe(200);
});

it.each(["owner", "project", "pending", "claimed"])(
  "rolls back description and claims when an upload has invalid %s",
  async (kind) => {
    const ctx = await setup();
    const other = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: other.workspace.id,
    });
    const good = await draftAsset(ctx);
    const bad = await draftAsset(
      ctx,
      kind === "owner"
        ? { createdBy: other.user.id }
        : kind === "project"
          ? { projectId: project.id, workspaceId: other.workspace.id }
          : kind === "pending"
            ? { surface: "draft-pending" }
            : { taskId: ctx.task.id, surface: "description" },
    );
    const response = await put(ctx, {
      description: `/api/asset/${good.id} /api/asset/${bad.id}`,
      expectedDescription: "Original",
      draftAssetIds: [good.id, bad.id],
    });
    expect(response.status).toBe(400);
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, ctx.task.id),
      }),
    ).toMatchObject({ description: "Original" });
    expect(
      await db.query.assetTable.findFirst({
        where: eq(schema.assetTable.id, good.id),
      }),
    ).toMatchObject({ taskId: null, surface: "draft" });
    expect(effects.publish).not.toHaveBeenCalled();
  },
);

it("does not write after the authorized task or project changes scope", async () => {
  const ctx = await setup();
  const { project } = await createProjectFixture({
    workspaceId: ctx.workspace.id,
  });
  await expect(
    updateTaskDescription({
      id: ctx.task.id,
      description: "New",
      currentUserId: ctx.user.id,
      expectedProjectId: project.id,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    updateTaskDescription({
      id: ctx.task.id,
      description: "New",
      currentUserId: ctx.user.id,
      expectedWorkspaceId: "old-workspace",
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(effects.publish).not.toHaveBeenCalled();
});

it.each(["task", "bug", "feature"] as const)(
  "supports %s descriptions without altering planning metadata",
  async (type) => {
    const ctx = await setup("owner", type);
    expect(
      (
        await put(ctx, {
          description: "# Document\n\n- [ ] Work",
          expectedDescription: "Original",
        })
      ).status,
    ).toBe(200);
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, ctx.task.id),
      }),
    ).toMatchObject({ type, description: "# Document\n\n- [ ] Work" });
  },
);

it.each(["", "/finalize"])(
  "permits task-update-only users to stage description assets%s",
  async (suffix) => {
    const ctx = await setup("document-editor");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "document-editor",
      permission: JSON.stringify({ task: ["read", "update"] }),
    });
    if (suffix)
      await draftAsset(ctx, {
        surface: "draft-pending",
        objectKey: "private-draft",
      });
    const response = await ctx.app.request(
      `/api/task/description/${ctx.task.id}/draft-upload${suffix}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "image.png",
          contentType: "image/png",
          size: 12,
          surface: "description",
          ...(suffix ? { key: "private-draft" } : {}),
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(await db.query.assetTable.findMany()).toEqual([
      expect.objectContaining({
        taskId: null,
        surface: suffix ? "draft" : "draft-pending",
      }),
    ]);
    expect(effects.publish).not.toHaveBeenCalled();
  },
);

it.each(["", "/finalize"])(
  "rejects read-only description upload%s before storage access",
  async (suffix) => {
    const ctx = await setup("document-reader");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "document-reader",
      permission: JSON.stringify({ task: ["read"] }),
    });
    const response = await ctx.app.request(
      `/api/task/description/${ctx.task.id}/draft-upload${suffix}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "image.png",
          contentType: "image/png",
          size: 12,
          surface: "description",
          key: "private-draft",
        }),
      },
    );
    expect(response.status).toBe(403);
    expect(effects.presign).not.toHaveBeenCalled();
    expect(effects.verify).not.toHaveBeenCalled();
    expect((await put(ctx, { description: "Forbidden" })).status).toBe(403);
  },
);

it("rolls back staged upload issuance if the task moves before recording it", async () => {
  const ctx = await setup();
  const { project } = await createProjectFixture({
    workspaceId: ctx.workspace.id,
  });
  effects.presign.mockImplementationOnce(async () => {
    await db
      .update(schema.taskTable)
      .set({ projectId: project.id })
      .where(eq(schema.taskTable.id, ctx.task.id));
    return {
      key: "private-draft",
      uploadUrl: "https://example.test/upload",
      headers: {},
    };
  });
  await expect(
    stageTaskAssetUpload(
      ctx.project.id,
      ctx.user.id,
      { filename: "x.png", contentType: "image/png", size: 12 },
      { taskId: ctx.task.id, expectedWorkspaceId: ctx.workspace.id },
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(await db.query.assetTable.findMany()).toHaveLength(0);
});

it("leaves finalization private if the task moves during storage verification", async () => {
  const ctx = await setup();
  const { project } = await createProjectFixture({
    workspaceId: ctx.workspace.id,
  });
  const asset = await draftAsset(ctx, {
    surface: "draft-pending",
    objectKey: "private-draft",
  });
  effects.verify.mockImplementationOnce(async () => {
    await db
      .update(schema.taskTable)
      .set({ projectId: project.id })
      .where(eq(schema.taskTable.id, ctx.task.id));
    return { contentType: "image/png", size: 12 };
  });
  await expect(
    finalizeStagedTaskAsset(
      ctx.project.id,
      ctx.user.id,
      {
        filename: "x.png",
        contentType: "image/png",
        size: 12,
        key: "private-draft",
      },
      { taskId: ctx.task.id, expectedWorkspaceId: ctx.workspace.id },
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.query.assetTable.findFirst({
      where: eq(schema.assetTable.id, asset.id),
    }),
  ).toMatchObject({ taskId: null, surface: "draft-pending" });
});

it.each([{ task: ["read"] }, { task: ["create"] }])(
  "requires task:update API-key scope %j",
  async (permissions) => {
    const ctx = await setup();
    const key = await auth.api.createApiKey({
      body: { userId: ctx.user.id, name: "Document scope", permissions },
    });
    mockAnonymousSession();
    const response = await ctx.app.request(
      `/api/task/description/${ctx.task.id}/draft-upload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key.key },
        body: JSON.stringify({
          filename: "image.png",
          contentType: "image/png",
          size: 12,
          surface: "description",
        }),
      },
    );
    expect(response.status).toBe(403);
    expect(effects.presign).not.toHaveBeenCalled();
  },
);

it("isolates description saves and uploads from other workspaces", async () => {
  const ctx = await setup();
  const outsider = await createWorkspaceMember();
  mockAuthenticatedSession(outsider.user);
  expect(
    (
      await put(ctx, {
        description: "Foreign save",
        expectedDescription: "Original",
      })
    ).status,
  ).toBe(404);
  const response = await ctx.app.request(
    `/api/task/description/${ctx.task.id}/draft-upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "image.png",
        contentType: "image/png",
        size: 12,
        surface: "description",
      }),
    },
  );
  expect(response.status).toBe(404);
  expect(effects.presign).not.toHaveBeenCalled();
});
