import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { migrateWorkItemPermissions } from "../../apps/api/src/migrations/work-item-permissions";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(resetTestDatabase);

async function setup(permission?: Record<string, string[]>) {
  const ctx = await createWorkspaceMember({
    role: permission ? "custom" : "owner",
  });
  if (permission)
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "custom",
      permission: JSON.stringify(permission),
    });
  const { project } = await createProjectFixture({
    workspaceId: ctx.workspace.id,
  });
  const task = await insertTask(project.id);
  const bug = await insertTask(project.id, { type: "bug" });
  const feature = await insertTask(project.id, { type: "feature" });
  // New tasks are numbered after the ones inserted directly.
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: feature.number! })
    .where(eq(schema.projectTable.id, project.id));
  mockAuthenticatedSession(ctx.user);
  const app = createApp().app;
  const send = (
    method: string,
    path: string,
    body: unknown = {},
    headers: Record<string, string> = {},
  ) => app.request(`/api${path}`, jsonRequest(method, body, headers));
  return { ...ctx, project, task, bug, feature, app, send };
}

describe("bug permissions", () => {
  it("lets a bug-only role report and edit bugs but not tasks", async () => {
    const ctx = await setup({
      task: ["read"],
      bug: ["create", "read", "update"],
    });

    const bug = await ctx.send("POST", `/task/${ctx.project.id}`, {
      title: "Crash on save",
      description: "",
      type: "bug",
    });
    expect(bug.status).toBe(200);
    const task = await ctx.send("POST", `/task/${ctx.project.id}`, {
      title: "Write docs",
      description: "",
    });
    expect(task.status).toBe(403);
    expect((await task.json()).missingPermissions).toEqual(["task:create"]);

    expect(
      (await ctx.send("PUT", `/task/title/${ctx.bug.id}`, { title: "Renamed" }))
        .status,
    ).toBe(200);
    expect(
      (
        await ctx.send("PUT", `/task/title/${ctx.task.id}`, {
          title: "Renamed",
        })
      ).status,
    ).toBe(403);

    expect(
      (await ctx.send("POST", `/comment/${ctx.bug.id}`, { content: "Seen" }))
        .status,
    ).toBe(200);
    expect(
      (await ctx.send("POST", `/comment/${ctx.task.id}`, { content: "Seen" }))
        .status,
    ).toBe(403);
  });

  it("checks delete, type changes and bulk edits against every row's type", async () => {
    const ctx = await setup({
      task: ["read"],
      bug: ["create", "read", "update"],
    });

    expect((await ctx.send("DELETE", `/task/${ctx.bug.id}`)).status).toBe(403);
    // Turning a bug into a task needs task:create.
    expect(
      (await ctx.send("PUT", `/task/type/${ctx.bug.id}`, { type: "task" }))
        .status,
    ).toBe(403);

    const bulk = (taskIds: string[]) =>
      ctx.send("PATCH", "/task/bulk", {
        taskIds,
        operation: "updatePriority",
        value: "high",
      });
    expect((await bulk([ctx.bug.id, ctx.task.id])).status).toBe(403);
    expect((await bulk([ctx.bug.id])).status).toBe(200);
  });

  it("applies bug scopes on API keys", async () => {
    const ctx = await setup();
    const key = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Bug triage",
        permissions: { bug: ["update"] },
      },
    });
    const headers = { "x-api-key": key.key };
    expect(
      (
        await ctx.send(
          "PUT",
          `/task/title/${ctx.bug.id}`,
          { title: "Triaged" },
          headers,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx.send(
          "PUT",
          `/task/title/${ctx.task.id}`,
          { title: "Triaged" },
          headers,
        )
      ).status,
    ).toBe(403);
  });
});

describe("feature permissions", () => {
  it("separates reading features from editing, creating and deleting them", async () => {
    const ctx = await setup({
      task: ["create", "read", "update", "delete"],
      feature: ["read"],
    });

    expect(
      (await ctx.app.request(`/api/feature/${ctx.feature.id}/documents`))
        .status,
    ).toBe(200);
    expect(
      (await ctx.app.request(`/api/task/feature-library/${ctx.project.id}`))
        .status,
    ).toBe(200);
    expect(
      (
        await ctx.send("POST", `/feature/${ctx.feature.id}/documents`, {
          title: "Spec",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await ctx.send("PUT", `/task/title/${ctx.feature.id}`, {
          title: "Renamed",
        })
      ).status,
    ).toBe(403);
    expect((await ctx.send("DELETE", `/task/${ctx.feature.id}`)).status).toBe(
      403,
    );
    expect(
      (
        await ctx.send("POST", `/task/${ctx.project.id}`, {
          title: "New feature",
          description: "",
          type: "feature",
        })
      ).status,
    ).toBe(403);
  });

  it("no longer lets task permissions read feature pages", async () => {
    const ctx = await setup({ task: ["create", "read", "update", "delete"] });
    expect(
      (await ctx.app.request(`/api/feature/${ctx.feature.id}/documents`))
        .status,
    ).toBe(403);
  });
});

describe("upgrade backfill", () => {
  it("gives existing roles and scoped API keys the bug, feature and milestone rights their task permissions implied, once", async () => {
    const ctx = await setup();
    const [legacy, custom, noTasks, updated] = await db
      .insert(schema.workspaceRoleTable)
      .values([
        {
          workspaceId: ctx.workspace.id,
          role: "member",
          permission: JSON.stringify({
            task: ["create", "read", "update"],
            label: ["read"],
          }),
        },
        {
          workspaceId: ctx.workspace.id,
          role: "triage",
          permission: JSON.stringify({ task: ["read", "delete", "assign"] }),
        },
        {
          workspaceId: ctx.workspace.id,
          role: "labeler",
          permission: JSON.stringify({ label: ["update"] }),
        },
        {
          workspaceId: ctx.workspace.id,
          role: "planner",
          permission: JSON.stringify({ task: ["read"], milestone: [] }),
        },
      ])
      .returning();
    const key = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Legacy",
        permissions: { task: ["read", "update"] },
      },
    });

    await migrateWorkItemPermissions();

    const permissionOf = async (id: string) => {
      const [row] = await db
        .select({ permission: schema.workspaceRoleTable.permission })
        .from(schema.workspaceRoleTable)
        .where(eq(schema.workspaceRoleTable.id, id));
      return JSON.parse(row?.permission ?? "null");
    };
    expect(await permissionOf(legacy!.id)).toEqual({
      task: ["create", "read", "update"],
      label: ["read"],
      bug: ["create", "read", "update"],
      feature: ["create", "read", "update"],
      milestone: ["create", "read", "update"],
    });
    expect(await permissionOf(custom!.id)).toMatchObject({
      bug: ["read", "delete"],
      feature: ["read", "delete"],
      milestone: ["read", "delete"],
    });
    expect(await permissionOf(noTasks!.id)).toEqual({ label: ["update"] });
    // A resource someone already set, even to nothing, is left alone.
    expect(await permissionOf(updated!.id)).toEqual({
      task: ["read"],
      milestone: [],
      bug: ["read"],
      feature: ["read"],
    });

    const [apiKey] = await db
      .select({ permissions: schema.apikeyTable.permissions })
      .from(schema.apikeyTable)
      .where(eq(schema.apikeyTable.id, key.id));
    expect(JSON.parse(apiKey?.permissions ?? "null")).toMatchObject({
      bug: ["read", "update"],
      feature: ["read", "update"],
      milestone: ["read", "update"],
    });

    await db
      .update(schema.workspaceRoleTable)
      .set({ permission: JSON.stringify({ task: ["read"] }) })
      .where(eq(schema.workspaceRoleTable.id, legacy!.id));
    await migrateWorkItemPermissions();
    expect(await permissionOf(legacy!.id)).toEqual({ task: ["read"] });
  });
});
