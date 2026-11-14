import { beforeEach, describe, expect, it } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
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

beforeEach(resetTestDatabase);
async function setup(role = "owner") {
  const ctx = await createWorkspaceMember({ role });
  const { project } = await createProjectFixture({
    workspaceId: ctx.workspace.id,
  });
  const feature = await insertTask(project.id, { type: "feature" });
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({ featureId: feature.id, title: "Checkpoint" })
    .returning();
  const task = await insertTask(project.id, { featureId: feature.id });
  return {
    ...ctx,
    project,
    feature,
    milestone: milestone!,
    task,
    app: createApp().app,
  };
}

async function useRole(
  ctx: Awaited<ReturnType<typeof setup>>,
  permission: Record<string, string[]>,
) {
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId: ctx.workspace.id,
    role: "custom",
    permission: JSON.stringify(permission),
  });
  mockAuthenticatedSession(ctx.user);
}

function send(
  ctx: Awaited<ReturnType<typeof setup>>,
  method: string,
  path: string,
  body: unknown,
  apiKey?: string,
) {
  const request = jsonRequest(method, body);
  return ctx.app.request(`/api${path}`, {
    ...request,
    headers: {
      ...request.headers,
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
  });
}

describe("milestone permissions", () => {
  it("lets milestone:read view milestones but not manage them", async () => {
    const ctx = await setup("custom");
    await useRole(ctx, { milestone: ["read"] });
    expect(
      (await ctx.app.request(`/api/milestone/feature/${ctx.feature.id}`))
        .status,
    ).toBe(200);
    expect(
      (await ctx.app.request(`/api/milestone/${ctx.milestone.id}`)).status,
    ).toBe(200);
    for (const [method, path, body] of [
      ["POST", `/milestone/feature/${ctx.feature.id}`, { title: "Forbidden" }],
      ["PATCH", `/milestone/${ctx.milestone.id}`, { title: "Forbidden" }],
      [
        "PUT",
        `/milestone/feature/${ctx.feature.id}/order`,
        { milestoneIds: [ctx.milestone.id] },
      ],
      ["DELETE", `/milestone/${ctx.milestone.id}`, {}],
      [
        "PATCH",
        `/task/${ctx.task.id}/milestone`,
        { milestoneId: ctx.milestone.id },
      ],
    ] as const) {
      expect((await send(ctx, method, path, body)).status).toBe(403);
    }
  });

  it("no longer lets task permissions read or manage milestones", async () => {
    const ctx = await setup("custom");
    await useRole(ctx, { task: ["create", "read", "update", "delete"] });
    expect(
      (await ctx.app.request(`/api/milestone/${ctx.milestone.id}`)).status,
    ).toBe(403);
    expect(
      (
        await send(ctx, "PATCH", `/milestone/${ctx.milestone.id}`, {
          title: "Forbidden",
        })
      ).status,
    ).toBe(403);
    // Moving a task into a milestone edits the task, so task:update is enough.
    expect(
      (
        await send(ctx, "PATCH", `/task/${ctx.task.id}/milestone`, {
          milestoneId: ctx.milestone.id,
        })
      ).status,
    ).toBe(200);
  });

  it("checks create, update and delete separately", async () => {
    const ctx = await setup("custom");
    await useRole(ctx, { milestone: ["read", "update"] });
    expect(
      (
        await send(ctx, "PATCH", `/milestone/${ctx.milestone.id}`, {
          title: "Renamed",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(ctx, "PUT", `/milestone/feature/${ctx.feature.id}/order`, {
          milestoneIds: [ctx.milestone.id],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(ctx, "POST", `/milestone/feature/${ctx.feature.id}`, {
          title: "No",
        })
      ).status,
    ).toBe(403);
    expect(
      (await send(ctx, "DELETE", `/milestone/${ctx.milestone.id}`, {})).status,
    ).toBe(403);
  });

  it("requires update on linked work and create on new drafts by their type", async () => {
    const ctx = await setup("custom");
    const bug = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      type: "bug",
    });
    await useRole(ctx, {
      milestone: ["create", "read", "update", "delete"],
      task: ["create", "read", "update"],
    });
    const path = `/milestone/feature/${ctx.feature.id}`;
    expect(
      (await send(ctx, "POST", path, { title: "Bugs", taskIds: [bug.id] }))
        .status,
    ).toBe(403);
    expect(
      (
        await send(ctx, "POST", path, {
          title: "New bug",
          newTasks: [{ title: "Crash", type: "bug" }],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send(ctx, "POST", path, {
          title: "Tasks",
          taskIds: [ctx.task.id],
          newTasks: [{ title: "Follow-up" }],
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(ctx, "DELETE", `/milestone/${ctx.milestone.id}`, {})).status,
    ).toBe(200);
  });

  it("applies milestone scopes on API keys", async () => {
    const ctx = await setup();
    const read = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Read milestones",
        permissions: { milestone: ["read"] },
      },
    });
    const write = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Manage milestones",
        permissions: {
          milestone: ["read", "create", "update"],
          task: ["update"],
        },
      },
    });
    const list = await ctx.app.request(
      `/api/milestone/feature/${ctx.feature.id}`,
      { headers: { "x-api-key": read.key } },
    );
    expect(list.status).toBe(200);
    const assign = { milestoneId: ctx.milestone.id };
    expect(
      (
        await send(
          ctx,
          "PATCH",
          `/task/${ctx.task.id}/milestone`,
          assign,
          read.key,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          ctx,
          "PATCH",
          `/task/${ctx.task.id}/milestone`,
          assign,
          write.key,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          ctx,
          "POST",
          `/milestone/feature/${ctx.feature.id}`,
          { title: "Scoped checkpoint", taskIds: [ctx.task.id] },
          write.key,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          ctx,
          "DELETE",
          `/milestone/${ctx.milestone.id}`,
          {},
          write.key,
        )
      ).status,
    ).toBe(403);
  });

  it("denies access without a workspace membership", async () => {
    const ctx = await setup();
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    expect(
      (await ctx.app.request(`/api/milestone/${ctx.milestone.id}`)).status,
    ).toBe(404);
    expect(
      (
        await ctx.app.request(
          `/api/milestone/feature/${ctx.feature.id}`,
          jsonRequest("POST", { title: "No" }),
        )
      ).status,
    ).toBe(404);
  });
});
