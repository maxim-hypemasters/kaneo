import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { handleMemberRemoved } from "../../apps/api/src/workspace-members/handle-member-removed";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture } from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { createTaskFixture } from "./helpers/project-access/create-task-fixture";
import { projectAccessApi } from "./helpers/project-access/project-access-api";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

const publish = vi.hoisted(() =>
  vi.fn(async (_event: string, _data?: unknown) => undefined),
);
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<typeof import("../../apps/api/src/events")>()),
  publishEvent: publish,
}));

beforeEach(async () => {
  await resetTestDatabase();
  publish.mockClear();
});

type User = typeof schema.userTable.$inferSelect;
type Team = {
  id: string;
  name: string;
  members: { id: string }[];
  projects: { id: string }[];
};

async function createWorkspace(name = "Teams") {
  const [workspace] = await db
    .insert(schema.workspaceTable)
    .values({
      id: `workspace-${randomUUID()}`,
      name,
      slug: `teams-${randomUUID()}`,
      createdAt: new Date(),
    })
    .returning();
  return workspace!;
}

async function setup() {
  const workspace = await createWorkspace();
  const owner = await addWorkspaceMember(workspace.id, "owner");
  const member = await addWorkspaceMember(workspace.id, "member");
  const alpha = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Alpha",
  });
  const beta = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Beta",
  });
  return { workspace, owner, member, alpha, beta };
}

function as(user: User) {
  mockAuthenticatedSession(user as never);
  return projectAccessApi();
}

async function createTeam(user: User, workspaceId: string, name = "Design") {
  const response = await as(user)(`/team/workspace/${workspaceId}`, {
    method: "POST",
    body: { name },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Team;
}

function setMembers(user: User, teamId: string, userIds: string[]) {
  return as(user)(`/team/${teamId}/members`, {
    method: "PUT",
    body: { userIds },
  });
}

function setProjects(user: User, teamId: string, projectIds: string[]) {
  return as(user)(`/team/${teamId}/projects`, {
    method: "PUT",
    body: { projectIds },
  });
}

async function visibleProjectIds(user: User, workspaceId: string) {
  const response = await as(user)(`/project?workspaceId=${workspaceId}`);
  expect(response.status).toBe(200);
  const projects = (await response.json()) as { id: string }[];
  return projects.map((project) => project.id).sort();
}

function accessEvents() {
  return publish.mock.calls
    .filter(([event]) => event === "project_access.updated")
    .map(([, data]) => data as { userId: string; projectIds: string[] });
}

describe("teams", () => {
  it("lets admins create, rename and delete teams, and members read them", async () => {
    const ctx = await setup();
    const team = await createTeam(ctx.owner, ctx.workspace.id, "  Design  ");
    expect(team).toMatchObject({ name: "Design", members: [], projects: [] });
    expect(publish).toHaveBeenCalledWith("team.changed", {
      workspaceId: ctx.workspace.id,
    });

    const renamed = await as(ctx.owner)(`/team/${team.id}`, {
      method: "PATCH",
      body: { name: "Product design" },
    });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ name: "Product design" });

    const list = await as(ctx.member)(`/team/workspace/${ctx.workspace.id}`);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject([
      { id: team.id, name: "Product design" },
    ]);

    const deleted = await as(ctx.owner)(`/team/${team.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    expect(
      await db
        .select()
        .from(schema.teamTable)
        .where(eq(schema.teamTable.id, team.id)),
    ).toEqual([]);
  });

  it("rejects duplicate names regardless of case", async () => {
    const ctx = await setup();
    const design = await createTeam(ctx.owner, ctx.workspace.id, "Design");
    const other = await createTeam(ctx.owner, ctx.workspace.id, "Platform");

    const duplicate = await as(ctx.owner)(
      `/team/workspace/${ctx.workspace.id}`,
      { method: "POST", body: { name: "design" } },
    );
    expect(duplicate.status).toBe(409);
    const rename = await as(ctx.owner)(`/team/${other.id}`, {
      method: "PATCH",
      body: { name: "DESIGN" },
    });
    expect(rename.status).toBe(409);
    const keep = await as(ctx.owner)(`/team/${design.id}`, {
      method: "PATCH",
      body: { name: "design" },
    });
    expect(keep.status).toBe(200);

    const blank = await as(ctx.owner)(`/team/workspace/${ctx.workspace.id}`, {
      method: "POST",
      body: { name: "   " },
    });
    expect(blank.status).toBe(400);
  });

  it("needs team permissions to change teams and hides them from outsiders", async () => {
    const ctx = await setup();
    const team = await createTeam(ctx.owner, ctx.workspace.id);

    const create = await as(ctx.member)(`/team/workspace/${ctx.workspace.id}`, {
      method: "POST",
      body: { name: "Mine" },
    });
    expect(create.status).toBe(403);
    expect(
      (
        await as(ctx.member)(`/team/${team.id}`, {
          method: "PATCH",
          body: { name: "Mine" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await setMembers(ctx.member, team.id, [ctx.member.id])).status,
    ).toBe(403);
    expect(
      (await setProjects(ctx.member, team.id, [ctx.alpha.project.id])).status,
    ).toBe(403);
    expect(
      (await as(ctx.member)(`/team/${team.id}`, { method: "DELETE" })).status,
    ).toBe(403);

    const other = await createWorkspace("Other");
    const outsider = await addWorkspaceMember(other.id, "owner");
    expect(
      (await as(outsider)(`/team/workspace/${ctx.workspace.id}`)).status,
    ).toBe(404);
    expect(
      (
        await as(outsider)(`/team/${team.id}`, {
          method: "PATCH",
          body: { name: "Taken" },
        })
      ).status,
    ).toBe(404);
  });

  it("only takes workspace members and workspace projects", async () => {
    const ctx = await setup();
    const team = await createTeam(ctx.owner, ctx.workspace.id);
    const other = await createWorkspace("Other");
    const stranger = await addWorkspaceMember(other.id);
    const foreign = await createProjectFixture({ workspaceId: other.id });

    expect((await setMembers(ctx.owner, team.id, [stranger.id])).status).toBe(
      400,
    );
    expect(
      (await setProjects(ctx.owner, team.id, [foreign.project.id])).status,
    ).toBe(400);

    const members = await setMembers(ctx.owner, team.id, [
      ctx.owner.id,
      ctx.member.id,
      ctx.member.id,
    ]);
    expect(members.status).toBe(200);
    expect(
      ((await members.json()) as Team).members
        .map((member) => member.id)
        .sort(),
    ).toEqual([ctx.owner.id, ctx.member.id].sort());
  });

  it("gives restricted members the team's projects, and takes them back", async () => {
    const ctx = await setup();
    await restrictToProjects(ctx.workspace.id, ctx.member.id, []);
    const task = await createTaskFixture(
      ctx.alpha,
      "Linked work",
      ctx.member.id,
    );
    const team = await createTeam(ctx.owner, ctx.workspace.id);
    expect(await visibleProjectIds(ctx.member, ctx.workspace.id)).toEqual([]);

    expect(
      (await setProjects(ctx.owner, team.id, [ctx.alpha.project.id])).status,
    ).toBe(200);
    expect(await visibleProjectIds(ctx.member, ctx.workspace.id)).toEqual([]);

    publish.mockClear();
    expect((await setMembers(ctx.owner, team.id, [ctx.member.id])).status).toBe(
      200,
    );
    expect(await visibleProjectIds(ctx.member, ctx.workspace.id)).toEqual([
      ctx.alpha.project.id,
    ]);
    expect(accessEvents()).toEqual([
      expect.objectContaining({
        userId: ctx.member.id,
        projectIds: [ctx.alpha.project.id],
      }),
    ]);
    const members = await as(ctx.owner)(
      `/workspace/${ctx.workspace.id}/members?projectId=${ctx.alpha.project.id}`,
    );
    expect(
      ((await members.json()) as { id: string }[]).map((row) => row.id),
    ).toContain(ctx.member.id);

    publish.mockClear();
    expect((await setProjects(ctx.owner, team.id, [])).status).toBe(200);
    expect(await visibleProjectIds(ctx.member, ctx.workspace.id)).toEqual([]);
    const [unassigned] = await db
      .select({ userId: schema.taskTable.userId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(unassigned?.userId).toBeNull();
    expect(publish).toHaveBeenCalledWith(
      "task.bulk_unassigned",
      expect.objectContaining({ projectId: ctx.alpha.project.id }),
    );

    await setProjects(ctx.owner, team.id, [ctx.beta.project.id]);
    expect(await visibleProjectIds(ctx.member, ctx.workspace.id)).toEqual([
      ctx.beta.project.id,
    ]);
    await setMembers(ctx.owner, team.id, []);
    expect(await visibleProjectIds(ctx.member, ctx.workspace.id)).toEqual([]);

    await setMembers(ctx.owner, team.id, [ctx.member.id]);
    publish.mockClear();
    expect(
      (await as(ctx.owner)(`/team/${team.id}`, { method: "DELETE" })).status,
    ).toBe(200);
    expect(await visibleProjectIds(ctx.member, ctx.workspace.id)).toEqual([]);
    expect(accessEvents()).toEqual([
      expect.objectContaining({
        userId: ctx.member.id,
        projectIds: [ctx.beta.project.id],
      }),
    ]);
  });

  it("keeps a direct grant when the team link goes away", async () => {
    const ctx = await setup();
    await restrictToProjects(ctx.workspace.id, ctx.member.id, [
      ctx.alpha.project.id,
    ]);
    const team = await createTeam(ctx.owner, ctx.workspace.id);
    await setProjects(ctx.owner, team.id, [ctx.alpha.project.id]);
    await setMembers(ctx.owner, team.id, [ctx.member.id]);
    publish.mockClear();

    await setMembers(ctx.owner, team.id, []);
    expect(await visibleProjectIds(ctx.member, ctx.workspace.id)).toEqual([
      ctx.alpha.project.id,
    ]);
    expect(accessEvents()).toEqual([]);
  });

  it("stops restricted admins from granting or touching projects they can't access", async () => {
    const ctx = await setup();
    const admin = await addWorkspaceMember(ctx.workspace.id, "admin");
    await restrictToProjects(ctx.workspace.id, admin.id, [
      ctx.alpha.project.id,
    ]);
    const hiddenTeam = await createTeam(ctx.owner, ctx.workspace.id, "Hidden");
    await setProjects(ctx.owner, hiddenTeam.id, [
      ctx.alpha.project.id,
      ctx.beta.project.id,
    ]);
    const visibleTeam = await createTeam(ctx.owner, ctx.workspace.id, "Shown");

    const list = await as(admin)(`/team/workspace/${ctx.workspace.id}`);
    const teams = (await list.json()) as Team[];
    expect(teams.find((team) => team.id === hiddenTeam.id)?.projects).toEqual([
      expect.objectContaining({ id: ctx.alpha.project.id }),
    ]);

    expect(
      (await setProjects(admin, visibleTeam.id, [ctx.beta.project.id])).status,
    ).toBe(403);
    expect(
      (await setMembers(admin, hiddenTeam.id, [ctx.member.id])).status,
    ).toBe(403);
    expect(
      (await as(admin)(`/team/${hiddenTeam.id}`, { method: "DELETE" })).status,
    ).toBe(403);

    // Unlinking what they can see leaves the hidden link in place.
    expect((await setProjects(admin, hiddenTeam.id, [])).status).toBe(200);
    const links = await db
      .select({ projectId: schema.teamProjectTable.projectId })
      .from(schema.teamProjectTable)
      .where(eq(schema.teamProjectTable.teamId, hiddenTeam.id));
    expect(links.map((link) => link.projectId)).toEqual([ctx.beta.project.id]);
  });

  it("drops team memberships when someone leaves the workspace", async () => {
    const ctx = await setup();
    const team = await createTeam(ctx.owner, ctx.workspace.id);
    await setMembers(ctx.owner, team.id, [ctx.member.id]);

    await db
      .delete(schema.workspaceUserTable)
      .where(eq(schema.workspaceUserTable.userId, ctx.member.id));
    await handleMemberRemoved({
      workspaceId: ctx.workspace.id,
      userId: ctx.member.id,
      userRole: null,
    });

    expect(
      await db
        .select()
        .from(schema.teamMemberTable)
        .where(eq(schema.teamMemberTable.teamId, team.id)),
    ).toEqual([]);
  });

  it("drops team links when a project moves to another workspace", async () => {
    const ctx = await setup();
    const target = await createWorkspace("Target");
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: target.id,
      userId: ctx.owner.id,
      role: "owner",
      joinedAt: new Date(),
    });
    const team = await createTeam(ctx.owner, ctx.workspace.id);
    await setProjects(ctx.owner, team.id, [ctx.alpha.project.id]);

    const moved = await as(ctx.owner)(`/project/${ctx.alpha.project.id}/move`, {
      method: "PUT",
      body: { workspaceId: target.id },
    });
    expect(moved.status).toBe(200);
    expect(
      await db
        .select()
        .from(schema.teamProjectTable)
        .where(eq(schema.teamProjectTable.teamId, team.id)),
    ).toEqual([]);
  });

  it("no longer serves Better Auth's team endpoints", async () => {
    const ctx = await setup();
    const response = await as(ctx.owner)(
      `/auth/organization/list-teams?organizationId=${ctx.workspace.id}`,
    );
    expect(response.status).toBe(404);
  });
});
