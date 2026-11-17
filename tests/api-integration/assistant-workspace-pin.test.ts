import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { ASSISTANT_WORKSPACE_HEADER } from "../../apps/api/src/utils/assistant-workspace-pin";
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
});

async function workspaceWithTasks(name: string, slug: string) {
  const member = await createWorkspaceMember({
    role: "owner",
    workspaceName: `Pin ${name}`,
  });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
    slug,
  });
  const first = await insertTask(project.id, { number: 1 });
  const second = await insertTask(project.id, { number: 2 });
  return { ...member, project, first, second };
}

function signIn(user: typeof schema.userTable.$inferSelect) {
  mockAuthenticatedSession(user);
  const app = createApp().app;
  const request = (path: string, pin?: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...(pin === undefined ? {} : { [ASSISTANT_WORKSPACE_HEADER]: pin }),
      },
    });
  const relate = (
    source: { id: string },
    target: { id: string },
    pin?: string,
  ) =>
    request(
      "/api/task-relation",
      pin,
      jsonRequest("POST", {
        sourceTaskId: source.id,
        targetTaskId: target.id,
        relationType: "related",
      }),
    );
  const search = async (query: string, pin?: string) => {
    const response = await request(`/api/search?${query}`, pin);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      results: Array<{ id: string }>;
    };
    return body.results.map((result) => result.id).sort();
  };
  const searchWorkspaces = (workspaceId: string, pin?: string) =>
    search(`q=pin&type=workspaces&workspaceId=${workspaceId}`, pin);
  return { request, relate, search, searchWorkspaces };
}

// One user who belongs to workspaces A and B; C is a workspace they are not in.
async function setup() {
  const a = await workspaceWithTasks("Alpha", "ALPHA");
  const b = await workspaceWithTasks("Beta", "BETA");
  const c = await workspaceWithTasks("Gamma", "GAMMA");
  await db.insert(schema.workspaceUserTable).values({
    workspaceId: b.workspace.id,
    userId: a.user.id,
    role: "owner",
    joinedAt: new Date(),
  });
  return { a, b, c, ...signIn(a.user) };
}

describe("assistant workspace pin", () => {
  it("hides other workspaces the user belongs to while pinned", async () => {
    const { a, b, request, relate, searchWorkspaces } = await setup();
    const pinA = a.workspace.id;

    expect((await request(`/api/task/${b.first.id}`)).status).toBe(200);
    expect((await request(`/api/task/${b.first.id}`, pinA)).status).toBe(404);
    expect((await request(`/api/task/${a.first.id}`, pinA)).status).toBe(200);

    expect((await relate(b.first, b.second, pinA)).status).toBe(404);
    expect(await db.select().from(schema.taskRelationTable)).toEqual([]);

    expect(await searchWorkspaces(a.workspace.id)).toEqual(
      [a.workspace.id, b.workspace.id].sort(),
    );
    expect(await searchWorkspaces(a.workspace.id, pinA)).toEqual([
      a.workspace.id,
    ]);
    expect(
      (await request(`/api/search?q=pin&workspaceId=${b.workspace.id}`, pinA))
        .status,
    ).toBe(404);

    expect((await request("/api/task/by-ticket-id/BETA-1")).status).toBe(200);
    expect((await request("/api/task/by-ticket-id/BETA-1", pinA)).status).toBe(
      404,
    );
    expect(
      (
        await request(
          `/api/task/by-ticket-id/BETA-1?workspaceId=${b.workspace.id}`,
          pinA,
        )
      ).status,
    ).toBe(404);
  });

  it("serves the pinned workspace normally", async () => {
    const { a, b, request, relate, searchWorkspaces } = await setup();
    const pinB = ` ${b.workspace.id} `;

    expect((await request(`/api/task/${b.first.id}`, pinB)).status).toBe(200);
    expect((await relate(b.first, b.second, pinB)).status).toBe(200);
    expect(await searchWorkspaces(b.workspace.id, pinB)).toEqual([
      b.workspace.id,
    ]);
    const ticket = await request("/api/task/by-ticket-id/BETA-1", pinB);
    expect(ticket.status).toBe(200);
    expect(await ticket.json()).toMatchObject({ id: b.first.id });

    expect((await request(`/api/task/${a.first.id}`, pinB)).status).toBe(404);
  });

  it("cannot widen access by pinning a workspace the user is not in", async () => {
    const { a, c, request, relate } = await setup();
    const pinC = c.workspace.id;

    expect((await request(`/api/task/${c.first.id}`, pinC)).status).toBe(404);
    expect((await request(`/api/task/${a.first.id}`, pinC)).status).toBe(404);
    expect((await relate(c.first, c.second, pinC)).status).toBe(404);
    expect(
      (await request(`/api/search?q=pin&workspaceId=${pinC}`, pinC)).status,
    ).toBe(404);
    expect((await request("/api/task/by-ticket-id/GAMMA-1", pinC)).status).toBe(
      404,
    );
    expect((await request("/api/task/by-ticket-id/ALPHA-1", pinC)).status).toBe(
      404,
    );
    expect(await db.select().from(schema.taskRelationTable)).toEqual([]);
  });

  it("holds an instance admin to the pinned workspace", async () => {
    const a = await workspaceWithTasks("Alpha", "ALPHA");
    const b = await workspaceWithTasks("Beta", "BETA");
    const [admin] = await db
      .update(schema.userTable)
      .set({ role: "user,admin" })
      .where(eq(schema.userTable.id, a.user.id))
      .returning();
    const { request, search, searchWorkspaces } = signIn(admin!);
    const pinA = a.workspace.id;
    const pinB = b.workspace.id;
    const searchB = `q=task&type=tasks&workspaceId=${b.workspace.id}`;
    const tasksOfB = [b.first.id, b.second.id].sort();

    // Without a pin the admin reaches B, which they never joined.
    expect((await request(`/api/task/${b.first.id}`)).status).toBe(200);
    expect(await search(searchB)).toEqual(tasksOfB);
    expect((await request("/api/task/by-ticket-id/BETA-1")).status).toBe(200);

    expect((await request(`/api/task/${b.first.id}`, pinA)).status).toBe(404);
    expect((await request(`/api/search?${searchB}`, pinA)).status).toBe(404);
    expect(await searchWorkspaces(a.workspace.id, pinA)).toEqual([
      a.workspace.id,
    ]);
    expect((await request("/api/task/by-ticket-id/BETA-1", pinA)).status).toBe(
      404,
    );
    expect(
      (
        await request(
          `/api/task/by-ticket-id/BETA-1?workspaceId=${b.workspace.id}`,
          pinA,
        )
      ).status,
    ).toBe(404);

    expect((await request(`/api/task/${b.first.id}`, pinB)).status).toBe(200);
    expect(await search(searchB, pinB)).toEqual(tasksOfB);
    const ticket = await request("/api/task/by-ticket-id/BETA-1", pinB);
    expect(ticket.status).toBe(200);
    expect(await ticket.json()).toMatchObject({ id: b.first.id });
    expect((await request(`/api/task/${a.first.id}`, pinB)).status).toBe(404);
  });

  it("ignores a blank pin and refuses an over-long one", async () => {
    const { a, b, request } = await setup();

    expect((await request(`/api/task/${b.first.id}`, "  ")).status).toBe(200);
    expect(
      (await request(`/api/task/${a.first.id}`, "w".repeat(129))).status,
    ).toBe(400);
  });
});
