import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { migrateTestCasePermissions } from "../../apps/api/src/migrations/test-case-permissions";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(resetTestDatabase);

async function setup(role = "custom") {
  const ctx = await createWorkspaceMember({ role });
  const { project } = await createProjectFixture({
    workspaceId: ctx.workspace.id,
  });
  const feature = await insertTask(project.id, { type: "feature" });
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({ featureId: feature.id, title: "Beta" })
    .returning();
  const bug = await insertTask(project.id, { type: "bug" });
  const [testCase] = await db
    .insert(schema.testCaseTable)
    .values({
      projectId: project.id,
      title: "Checks out",
      milestoneId: milestone!.id,
      bugId: bug.id,
    })
    .returning();
  const app = createApp().app;
  return {
    ...ctx,
    project,
    feature,
    milestone: milestone!,
    bug,
    testCase: testCase!,
    request: (method: string, path: string, body?: unknown) =>
      app.request(
        `/api/test-case${path}`,
        body === undefined ? { method } : jsonRequest(method, body),
      ),
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

describe("test case permissions", () => {
  it("needs test_case:read to list or read", async () => {
    const ctx = await setup();
    await useRole(ctx, { milestone: ["read"], bug: ["read"] });
    expect(
      (await ctx.request("GET", `/project/${ctx.project.id}`)).status,
    ).toBe(403);
    expect((await ctx.request("GET", `/${ctx.testCase.id}`)).status).toBe(403);
  });

  it("hides milestone and bug details the caller can't read", async () => {
    const ctx = await setup();
    await useRole(ctx, { test_case: ["read"] });
    const response = await ctx.request("GET", `/${ctx.testCase.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      milestoneId: ctx.milestone.id,
      bugId: ctx.bug.id,
      milestone: null,
      bug: null,
    });
    // A Feature's test cases come from its milestones.
    expect(
      (await ctx.request("GET", `/feature/${ctx.feature.id}`)).status,
    ).toBe(403);
  });

  it("lets viewers read but not write", async () => {
    const ctx = await setup("viewer");
    mockAuthenticatedSession(ctx.user);
    expect((await ctx.request("GET", `/${ctx.testCase.id}`)).status).toBe(200);
    expect(
      (await ctx.request("POST", `/project/${ctx.project.id}`, { title: "x" }))
        .status,
    ).toBe(403);
    expect(
      (await ctx.request("PATCH", `/${ctx.testCase.id}`, { status: "passed" }))
        .status,
    ).toBe(403);
    expect((await ctx.request("DELETE", `/${ctx.testCase.id}`)).status).toBe(
      403,
    );
  });

  it("needs read access on a link target to link it", async () => {
    const ctx = await setup();
    await useRole(ctx, { test_case: ["create", "read", "update"] });
    expect(
      (
        await ctx.request("POST", `/project/${ctx.project.id}`, {
          title: "x",
          bugId: ctx.bug.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await ctx.request("PATCH", `/${ctx.testCase.id}`, {
          milestoneId: ctx.milestone.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (await ctx.request("PATCH", `/${ctx.testCase.id}`, { status: "passed" }))
        .status,
    ).toBe(200);
  });

  it("hides test cases from people in another workspace", async () => {
    const ctx = await setup("owner");
    const outsider = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(outsider.user);
    expect((await ctx.request("GET", `/${ctx.testCase.id}`)).status).toBe(404);
    expect(
      (await ctx.request("PATCH", `/${ctx.testCase.id}`, { status: "passed" }))
        .status,
    ).toBe(404);
    expect(
      (await ctx.request("GET", `/project/${ctx.project.id}`)).status,
    ).toBe(404);
  });
});

describe("migrateTestCasePermissions", () => {
  it("grants stored roles their milestone actions once", async () => {
    const ctx = await createWorkspaceMember();
    const [role] = await db
      .insert(schema.workspaceRoleTable)
      .values({
        workspaceId: ctx.workspace.id,
        role: "qa",
        permission: JSON.stringify({ milestone: ["read", "update"] }),
      })
      .returning();
    await migrateTestCasePermissions();
    const read = async () =>
      JSON.parse(
        (await db.query.workspaceRoleTable.findFirst({
          where: eq(schema.workspaceRoleTable.id, role!.id),
        }))!.permission,
      );
    expect((await read()).test_case).toEqual(["read", "update"]);

    await db
      .update(schema.workspaceRoleTable)
      .set({ permission: JSON.stringify({ milestone: ["read"] }) })
      .where(eq(schema.workspaceRoleTable.id, role!.id));
    await migrateTestCasePermissions();
    expect((await read()).test_case).toBeUndefined();
    expect(
      await db.query.dataMigrationTable.findFirst({
        where: eq(schema.dataMigrationTable.id, "test-case-permissions-v1"),
      }),
    ).toBeDefined();
  });
});
