import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { migrateProjectDocumentPermissions } from "../../apps/api/src/migrations/project-document-permissions";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(resetTestDatabase);

// A workspace with one project page and one Feature document, and a second
// person whose role is `role`, defined by `permission` when it is custom.
async function setup(role: string, permission?: Record<string, string[]>) {
  const owner = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: owner.workspace.id,
    slug: "PP",
  });
  const [page] = await db
    .insert(schema.projectDocumentTable)
    .values({ projectId: project.id, title: "Handbook", body: "zebra notes" })
    .returning();
  const feature = await insertTask(project.id, {
    type: "feature",
    title: "Search",
  });
  await db
    .insert(schema.featureDocumentTable)
    .values({ featureId: feature.id, title: "Spec", body: "zebra spec" });
  const person = await createWorkspaceMember({ role });
  await db
    .update(schema.workspaceUserTable)
    .set({ workspaceId: owner.workspace.id })
    .where(eq(schema.workspaceUserTable.userId, person.user.id));
  if (permission)
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: owner.workspace.id,
      role,
      permission: JSON.stringify(permission),
    });
  mockAuthenticatedSession(person.user);
  const app = createApp().app;
  const request = (path: string, method = "GET", body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  return { workspace: owner.workspace, project, page: page!, request };
}

describe("project page permissions", () => {
  it("keeps pages from roles without document:read", async () => {
    const ctx = await setup("taskonly", {
      project: ["read"],
      task: ["create", "read", "update", "delete"],
    });
    expect(
      (await ctx.request(`/project-document/project/${ctx.project.id}`)).status,
    ).toBe(403);
    expect((await ctx.request(`/project-document/${ctx.page.id}`)).status).toBe(
      403,
    );
  });

  it("lets a pages-only role manage pages but not see Feature documents", async () => {
    const ctx = await setup("writer", {
      project: ["read"],
      document: ["create", "read", "update", "delete"],
    });
    const tree = await ctx.request(
      `/project-document/project/${ctx.project.id}`,
    );
    expect(tree.status).toBe(200);
    expect(await tree.json()).toMatchObject({
      pages: [expect.objectContaining({ title: "Handbook" })],
      features: [],
    });
    const created = await ctx.request(
      `/project-document/project/${ctx.project.id}`,
      "POST",
      { title: "Onboarding", parentId: ctx.page.id },
    );
    expect(created.status).toBe(200);
    const { id } = await created.json();
    expect(
      (
        await ctx.request(`/project-document/${id}`, "PUT", {
          body: "Welcome",
          expectedRevision: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx.request(`/project-document/${id}/move`, "PUT", {
          parentId: null,
          index: 0,
        })
      ).status,
    ).toBe(200);
    expect(
      (await ctx.request(`/project-document/${id}`, "DELETE")).status,
    ).toBe(200);
  });

  it("checks each page action separately", async () => {
    const ctx = await setup("reader-editor", {
      project: ["read"],
      document: ["read", "update"],
    });
    expect(
      (
        await ctx.request(
          `/project-document/project/${ctx.project.id}`,
          "POST",
          {
            title: "Nope",
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await ctx.request(`/project-document/${ctx.page.id}`, "PUT", {
          title: "Renamed",
          expectedRevision: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (await ctx.request(`/project-document/${ctx.page.id}`, "DELETE")).status,
    ).toBe(403);
  });

  it("finds project pages in search only with document:read", async () => {
    const reader = await setup("member");
    const found = await (
      await reader.request(
        `/search?q=zebra&type=documents&workspaceId=${reader.workspace.id}`,
      )
    ).json();
    expect(
      found.results.map((result: { title: string; featureId?: string }) => [
        result.title,
        Boolean(result.featureId),
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["Handbook", false],
        ["Spec", true],
      ]),
    );

    await resetTestDatabase();
    const blind = await setup("taskonly", {
      project: ["read"],
      task: ["read"],
    });
    const hidden = await (
      await blind.request(
        `/search?q=zebra&type=documents&workspaceId=${blind.workspace.id}`,
      )
    ).json();
    expect(
      hidden.results.map((result: { title: string }) => result.title),
    ).toEqual(["Spec"]);
  });
});

describe("project detail permissions", () => {
  it("lets project:edit_details rename a project without full project edits", async () => {
    const ctx = await setup("details", {
      project: ["read", "edit_details"],
    });
    const renamed = await ctx.request(
      `/project/${ctx.project.id}/details`,
      "PATCH",
      { name: "Payments", description: "Money in, money out" },
    );
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({
      name: "Payments",
      description: "Money in, money out",
      slug: ctx.project.slug,
    });
    expect(
      (
        await ctx.request(`/project/${ctx.project.id}`, "PUT", {
          name: "Payments",
          icon: "Folder",
          slug: "NEW",
          description: "",
          isPublic: false,
        })
      ).status,
    ).toBe(403);
  });

  it("refuses detail edits to members by default and rejects blank names", async () => {
    const member = await setup("member");
    expect(
      (
        await member.request(`/project/${member.project.id}/details`, "PATCH", {
          name: "Nope",
        })
      ).status,
    ).toBe(403);

    await resetTestDatabase();
    const admin = await setup("admin");
    expect(
      (
        await admin.request(`/project/${admin.project.id}/details`, "PATCH", {
          name: "   ",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.request(`/project/${admin.project.id}/details`, "PATCH", {
          description: "Only the description",
        })
      ).status,
    ).toBe(200);
  });
});

describe("migrateProjectDocumentPermissions", () => {
  it("grants stored roles and API keys what task and project:update gave them, once", async () => {
    const { workspace } = await createWorkspaceMember({ role: "owner" });
    const [member, viewer, custom] = await db
      .insert(schema.workspaceRoleTable)
      .values([
        {
          workspaceId: workspace.id,
          role: "member",
          permission: JSON.stringify({
            project: ["create", "read"],
            task: ["create", "read", "update"],
          }),
        },
        {
          workspaceId: workspace.id,
          role: "viewer",
          permission: JSON.stringify({ project: ["read"], task: ["read"] }),
        },
        {
          workspaceId: workspace.id,
          role: "lead",
          permission: JSON.stringify({
            project: ["read", "update"],
            task: ["read", "delete"],
            document: ["read"],
          }),
        },
      ])
      .returning();

    await migrateProjectDocumentPermissions();
    await migrateProjectDocumentPermissions();

    const permission = async (id: string) => {
      const [row] = await db
        .select({ permission: schema.workspaceRoleTable.permission })
        .from(schema.workspaceRoleTable)
        .where(eq(schema.workspaceRoleTable.id, id));
      return JSON.parse(row!.permission);
    };
    expect((await permission(member!.id)).document).toEqual([
      "create",
      "read",
      "update",
    ]);
    expect((await permission(viewer!.id)).document).toEqual(["read"]);
    expect(await permission(custom!.id)).toEqual({
      project: ["read", "update", "edit_details"],
      task: ["read", "delete"],
      document: ["read"],
    });
    expect(
      await db
        .select()
        .from(schema.dataMigrationTable)
        .where(
          eq(schema.dataMigrationTable.id, "project-document-permissions-v1"),
        ),
    ).toHaveLength(1);
  });
});
