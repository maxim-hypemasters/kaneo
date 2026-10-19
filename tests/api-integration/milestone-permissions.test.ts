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

describe("milestone permissions", () => {
  it("permits task:read for viewing and requires task:update for all management and assignment", async () => {
    const ctx = await setup("milestone_reader");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "milestone_reader",
      permission: JSON.stringify({ task: ["read"] }),
    });
    mockAuthenticatedSession(ctx.user);
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
      expect(
        (await ctx.app.request(`/api${path}`, jsonRequest(method, body)))
          .status,
      ).toBe(403);
    }
  });

  it("uses task scopes on API keys and preserves the scope on milestone reads and writes", async () => {
    const ctx = await setup();
    const read = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Read milestones",
        permissions: { task: ["read"] },
      },
    });
    const write = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Manage milestones",
        permissions: { task: ["read", "update"] },
      },
    });
    const list = await ctx.app.request(
      `/api/milestone/feature/${ctx.feature.id}`,
      { headers: { "x-api-key": read.key } },
    );
    expect(list.status).toBe(200);
    const patch = jsonRequest("PATCH", { milestoneId: ctx.milestone.id });
    expect(
      (
        await ctx.app.request(`/api/task/${ctx.task.id}/milestone`, {
          ...patch,
          headers: { ...patch.headers, "x-api-key": read.key },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await ctx.app.request(`/api/task/${ctx.task.id}/milestone`, {
          ...patch,
          headers: { ...patch.headers, "x-api-key": write.key },
        })
      ).status,
    ).toBe(200);
    const create = jsonRequest("POST", {
      title: "Scoped checkpoint",
      taskIds: [ctx.task.id],
    });
    expect(
      (
        await ctx.app.request(`/api/milestone/feature/${ctx.feature.id}`, {
          ...create,
          headers: { ...create.headers, "x-api-key": write.key },
        })
      ).status,
    ).toBe(200);
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
