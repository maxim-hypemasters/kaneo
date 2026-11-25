import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import {
  addConnection,
  initializeWebSocketAdapter,
  removeConnection,
  shutdownWebSocketAdapter,
} from "../../apps/api/src/ws";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { projectAccessApi } from "./helpers/project-access/project-access-api";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

// Records each event while still delivering it, so the WebSocket layer runs.
const publish = vi.hoisted(() =>
  vi.fn(async (_event: string, _data?: unknown) => undefined),
);
vi.mock("../../apps/api/src/events", async (original) => {
  const actual = await original<typeof import("../../apps/api/src/events")>();
  publish.mockImplementation(actual.publishEvent);
  return { ...actual, publishEvent: publish };
});

beforeEach(async () => {
  await resetTestDatabase();
  publish.mockClear();
});

type User = typeof schema.userTable.$inferSelect;
type Link = {
  id: string;
  projectId: string;
  url: string;
  title: string;
  position: number;
};

async function setup() {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
  });
  const member = await addWorkspaceMember(workspace.id, "member");
  const viewer = await addWorkspaceMember(workspace.id, "viewer");
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Alpha",
  });
  const { project: other } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Beta",
  });
  return { workspace, owner, member, viewer, project, other };
}

function as(user: User, headers?: Record<string, string>) {
  mockAuthenticatedSession(user as never);
  return projectAccessApi(headers);
}

const path = (projectId: string, suffix = "") =>
  `/project-link/project/${projectId}${suffix}`;

function add(
  user: User,
  projectId: string,
  body: unknown = { url: "https://example.com/spec", title: "Spec" },
) {
  return as(user)(path(projectId), { method: "POST", body });
}

async function added(user: User, projectId: string, title: string) {
  const response = await add(user, projectId, {
    url: `https://example.com/${title.toLowerCase()}`,
    title,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Link;
}

async function list(user: User, projectId: string) {
  const response = await as(user)(path(projectId));
  expect(response.status).toBe(200);
  return (await response.json()) as Link[];
}

const linkEvents = () =>
  publish.mock.calls.filter(([event]) => event === "project.links_updated");

async function addRole(
  workspaceId: string,
  role: string,
  permission: Record<string, string[]>,
) {
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId,
    role,
    permission: JSON.stringify(permission),
  });
  return addWorkspaceMember(workspaceId, role);
}

describe("project links", () => {
  it("lets a project editor add, edit, reorder and remove links", async () => {
    const ctx = await setup();
    const created = await add(ctx.owner, ctx.project.id, {
      url: "  https://example.com/spec  ",
      title: "  Spec  ",
    });
    expect(created.status).toBe(200);
    const spec = (await created.json()) as Link;
    expect(spec).toMatchObject({
      projectId: ctx.project.id,
      url: "https://example.com/spec",
      title: "Spec",
      position: 0,
    });
    const design = await added(ctx.owner, ctx.project.id, "Design");
    const staging = await added(ctx.owner, ctx.project.id, "Staging");
    expect(
      (await list(ctx.owner, ctx.project.id)).map((link) => link.title),
    ).toEqual(["Spec", "Design", "Staging"]);

    const renamed = await as(ctx.owner)(path(ctx.project.id, `/${design.id}`), {
      method: "PATCH",
      body: { title: "Design file" },
    });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({
      id: design.id,
      title: "Design file",
      url: design.url,
    });

    // Staging first, then Spec; Design file was left out and follows them.
    const reordered = await as(ctx.owner)(path(ctx.project.id, "/reorder"), {
      method: "PUT",
      body: {
        links: [
          { id: spec.id, position: 5 },
          { id: staging.id, position: 2 },
        ],
      },
    });
    expect(reordered.status).toBe(200);
    expect(
      ((await reordered.json()) as Link[]).map((link) => [
        link.title,
        link.position,
      ]),
    ).toEqual([
      ["Staging", 0],
      ["Spec", 1],
      ["Design file", 2],
    ]);

    const removed = await as(ctx.owner)(path(ctx.project.id, `/${spec.id}`), {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ id: spec.id });
    expect(
      (await list(ctx.owner, ctx.project.id)).map((link) => link.title),
    ).toEqual(["Staging", "Design file"]);

    // A link added after a removal still lands last.
    await added(ctx.owner, ctx.project.id, "Roadmap");
    expect(
      (await list(ctx.owner, ctx.project.id)).map((link) => link.title),
    ).toEqual(["Staging", "Design file", "Roadmap"]);

    expect(linkEvents()).toHaveLength(7);
    for (const [, data] of linkEvents())
      expect(data).toEqual({ projectId: ctx.project.id });
  });

  it("lets everyone with access read, and only project:edit_details holders write", async () => {
    const ctx = await setup();
    const link = await added(ctx.owner, ctx.project.id, "Spec");
    publish.mockClear();

    for (const reader of [ctx.member, ctx.viewer]) {
      expect(
        (await list(reader, ctx.project.id)).map((item) => item.id),
      ).toEqual([link.id]);
      expect((await add(reader, ctx.project.id)).status).toBe(403);
      expect(
        (
          await as(reader)(path(ctx.project.id, `/${link.id}`), {
            method: "PATCH",
            body: { title: "Mine" },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await as(reader)(path(ctx.project.id, "/reorder"), {
            method: "PUT",
            body: { links: [{ id: link.id, position: 0 }] },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await as(reader)(path(ctx.project.id, `/${link.id}`), {
            method: "DELETE",
          })
        ).status,
      ).toBe(403);
    }

    // project:update is a different permission and does not cover links.
    const settingsEditor = await addRole(ctx.workspace.id, "settings-editor", {
      project: ["read", "update"],
    });
    expect((await add(settingsEditor, ctx.project.id)).status).toBe(403);
    expect(linkEvents()).toEqual([]);
    expect(
      (await list(ctx.owner, ctx.project.id)).map((item) => item.title),
    ).toEqual(["Spec"]);

    const detailEditor = await addRole(ctx.workspace.id, "detail-editor", {
      project: ["read", "edit_details"],
    });
    expect((await add(detailEditor, ctx.project.id)).status).toBe(200);
  });

  it("keeps links from people without access to the project", async () => {
    const ctx = await setup();
    const link = await added(ctx.owner, ctx.project.id, "Spec");

    const { user: outsider } = await createWorkspaceMember({ role: "owner" });
    expect((await as(outsider)(path(ctx.project.id))).status).toBe(404);
    expect((await add(outsider, ctx.project.id)).status).toBe(404);
    expect(
      (
        await as(outsider)(path(ctx.project.id, `/${link.id}`), {
          method: "DELETE",
        })
      ).status,
    ).toBe(404);

    await restrictToProjects(ctx.workspace.id, ctx.member.id, [ctx.other.id]);
    expect((await as(ctx.member)(path(ctx.project.id))).status).toBe(403);
    expect(await list(ctx.member, ctx.other.id)).toEqual([]);
  });

  it("binds a link id to the project in the path", async () => {
    const ctx = await setup();
    const link = await added(ctx.owner, ctx.project.id, "Spec");
    publish.mockClear();

    expect(
      (
        await as(ctx.owner)(path(ctx.other.id, `/${link.id}`), {
          method: "PATCH",
          body: { title: "Moved" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await as(ctx.owner)(path(ctx.other.id, `/${link.id}`), {
          method: "DELETE",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await as(ctx.owner)(path(ctx.other.id, "/reorder"), {
          method: "PUT",
          body: { links: [{ id: link.id, position: 0 }] },
        })
      ).status,
    ).toBe(400);

    expect(await list(ctx.owner, ctx.project.id)).toMatchObject([
      { id: link.id, title: "Spec" },
    ]);
    expect(linkEvents()).toEqual([]);
  });

  it("refuses addresses a link must not open, and incomplete links", async () => {
    const ctx = await setup();
    const link = await added(ctx.owner, ctx.project.id, "Spec");
    publish.mockClear();

    for (const body of [
      { url: "javascript:alert(1)", title: "Run" },
      { url: "ftp://example.com/file", title: "File" },
      { url: "not a url", title: "Nothing" },
      { url: `https://example.com/${"a".repeat(2048)}`, title: "Long" },
      { url: "https://example.com", title: "   " },
      { url: "https://example.com", title: "a".repeat(201) },
      { url: "https://example.com" },
    ])
      expect((await add(ctx.owner, ctx.project.id, body)).status).toBe(400);

    const patch = (body: unknown) =>
      as(ctx.owner)(path(ctx.project.id, `/${link.id}`), {
        method: "PATCH",
        body,
      });
    expect((await patch({})).status).toBe(400);
    expect((await patch({ url: "javascript:alert(1)" })).status).toBe(400);
    expect((await patch({ title: "" })).status).toBe(400);

    expect(
      (
        await as(ctx.owner)(path(ctx.project.id, "/reorder"), {
          method: "PUT",
          body: {
            links: [
              { id: link.id, position: 0 },
              { id: link.id, position: 1 },
            ],
          },
        })
      ).status,
    ).toBe(400);

    expect(await list(ctx.owner, ctx.project.id)).toMatchObject([
      { id: link.id, title: "Spec", url: "https://example.com/spec" },
    ]);
    expect(linkEvents()).toEqual([]);
  });

  it("holds at most 100 links per project", async () => {
    const ctx = await setup();
    await db.insert(schema.projectLinkTable).values(
      Array.from({ length: 100 }, (_, position) => ({
        id: `link-${randomUUID()}`,
        projectId: ctx.project.id,
        url: `https://example.com/${position}`,
        title: `Link ${position}`,
        position,
      })),
    );

    expect((await add(ctx.owner, ctx.project.id)).status).toBe(409);
    expect(await list(ctx.owner, ctx.project.id)).toHaveLength(100);
    // The limit is per project.
    expect((await add(ctx.owner, ctx.other.id)).status).toBe(200);
  });

  it("removes a project's links with the project", async () => {
    const ctx = await setup();
    await added(ctx.owner, ctx.project.id, "Spec");
    const kept = await added(ctx.owner, ctx.other.id, "Design");

    await db
      .delete(schema.projectTable)
      .where(eq(schema.projectTable.id, ctx.project.id));

    expect(
      (await db.select().from(schema.projectLinkTable)).map((row) => row.id),
    ).toEqual([kept.id]);
  });
});

describe("live project link updates", () => {
  function watch(
    projectId: string,
    userId: string,
    windowId: string,
    workspaceId: string,
  ) {
    const send = vi.fn();
    const connection = addConnection(
      projectId,
      { send } as never,
      userId,
      `${userId}:${windowId}`,
      workspaceId,
    );
    return {
      messages: () =>
        send.mock.calls.map(([message]) => JSON.parse(message as string)),
      stop: () => removeConnection(projectId, connection),
    };
  }

  it("sends PROJECT_LINKS_UPDATED to the project's other windows only", async () => {
    const ctx = await setup();
    await initializeWebSocketAdapter();
    const watching = watch(
      ctx.project.id,
      ctx.viewer.id,
      "watching",
      ctx.workspace.id,
    );
    const editing = watch(
      ctx.project.id,
      ctx.owner.id,
      "editing",
      ctx.workspace.id,
    );
    const elsewhere = watch(
      ctx.other.id,
      ctx.viewer.id,
      "elsewhere",
      ctx.workspace.id,
    );
    try {
      const created = await as(ctx.owner, { "X-Kaneo-Window-Id": "editing" })(
        path(ctx.project.id),
        {
          method: "POST",
          body: { url: "https://example.com/spec", title: "Spec" },
        },
      );
      expect(created.status).toBe(200);

      const expected = {
        type: "PROJECT_LINKS_UPDATED",
        projectId: ctx.project.id,
      };
      await vi.waitFor(() =>
        expect(watching.messages()).toContainEqual(expected),
      );
      expect(editing.messages()).toEqual([]);
      expect(elsewhere.messages()).toEqual([]);
    } finally {
      watching.stop();
      editing.stop();
      elsewhere.stop();
      await shutdownWebSocketAdapter();
    }
  });
});
