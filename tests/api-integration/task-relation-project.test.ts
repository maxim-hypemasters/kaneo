import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";

beforeEach(resetTestDatabase);

type RelationType = "subtask" | "blocks" | "related";

async function seedTask(projectId: string, number: number) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({ projectId, title: `Task ${number}`, number })
    .returning();
  return task;
}

async function seedRelation(
  sourceTaskId: string,
  targetTaskId: string,
  relationType: RelationType,
) {
  const [relation] = await db
    .insert(schema.taskRelationTable)
    .values({ sourceTaskId, targetTaskId, relationType })
    .returning();
  return {
    id: relation.id,
    sourceTaskId,
    targetTaskId,
    relationType,
  };
}

function getProjectRelations(projectId: string, query = "") {
  return createApp().app.request(
    `/api/task-relation/project/${projectId}${query}`,
  );
}

async function projectWithRelations() {
  const member = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const { project: otherProject } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const [first, second, third] = await Promise.all(
    [1, 2, 3].map((number) => seedTask(project.id, number)),
  );
  const outside = await seedTask(otherProject.id, 1);

  const blocks = await seedRelation(first.id, second.id, "blocks");
  const subtask = await seedRelation(first.id, third.id, "subtask");
  const related = await seedRelation(second.id, third.id, "related");
  // Cross-project relations in either direction stay out of both projects.
  await seedRelation(first.id, outside.id, "blocks");
  await seedRelation(outside.id, third.id, "blocks");

  return { ...member, project, otherProject, blocks, subtask, related };
}

describe("GET /task-relation/project/{projectId}", () => {
  it("returns only relations between the project's own tasks", async () => {
    const ctx = await projectWithRelations();
    mockAuthenticatedSession(ctx.user);

    const response = await getProjectRelations(ctx.project.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      ctx.blocks,
      ctx.subtask,
      ctx.related,
    ]);
    const other = await getProjectRelations(ctx.otherProject.id);
    expect(other.status).toBe(200);
    expect(await other.json()).toEqual([]);
  });

  it("filters by relationType", async () => {
    const ctx = await projectWithRelations();
    mockAuthenticatedSession(ctx.user);

    for (const [type, expected] of [
      ["blocks", ctx.blocks],
      ["subtask", ctx.subtask],
      ["related", ctx.related],
    ] as const) {
      const response = await getProjectRelations(
        ctx.project.id,
        `?relationType=${type}`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([expected]);
    }
  });

  it("rejects an unknown relationType", async () => {
    const ctx = await projectWithRelations();
    mockAuthenticatedSession(ctx.user);

    const response = await getProjectRelations(
      ctx.project.id,
      "?relationType=duplicates",
    );

    expect(response.status).toBe(400);
  });

  it("lets a viewer read the project's relations", async () => {
    const ctx = await projectWithRelations();
    const viewer = await addWorkspaceMember(ctx.workspace.id, "viewer");
    mockAuthenticatedSession(viewer);

    const response = await getProjectRelations(
      ctx.project.id,
      "?relationType=blocks",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([ctx.blocks]);
  });

  it("refuses a role without task:read", async () => {
    const ctx = await projectWithRelations();
    const reader = await addWorkspaceMember(ctx.workspace.id, "project-only");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "project-only",
      permission: JSON.stringify({ project: ["read"], workspace: ["read"] }),
    });
    mockAuthenticatedSession(reader);

    const response = await getProjectRelations(ctx.project.id);

    expect(response.status).toBe(403);
    expect(await readErrorBody(response)).toMatchObject({
      code: "MISSING_PERMISSION",
    });
  });

  it("hides another workspace's project like a missing one", async () => {
    const ctx = await projectWithRelations();
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);

    for (const projectId of [ctx.project.id, "missing-project"]) {
      const response = await getProjectRelations(projectId);
      expect(response.status).toBe(404);
      expect(await readErrorBody(response)).toMatchObject({
        message: "Project not found",
        code: "NOT_FOUND",
      });
    }
  });

  it("refuses a restricted member outside the project selection", async () => {
    const ctx = await createRestrictedWorkspace();
    const alphaSecond = await seedTask(ctx.alpha.id, 2);
    const inside = await seedRelation(
      ctx.alphaTask.id,
      alphaSecond.id,
      "blocks",
    );
    // Relations into the hidden project must not reveal its task ids.
    await seedRelation(ctx.alphaTask.id, ctx.betaTask.id, "blocks");
    await seedRelation(ctx.betaTask.id, alphaSecond.id, "blocks");
    mockAuthenticatedSession(ctx.restricted);

    const hidden = await getProjectRelations(ctx.beta.id);
    expect(hidden.status).toBe(403);

    const visible = await getProjectRelations(ctx.alpha.id);
    expect(visible.status).toBe(200);
    expect(await visible.json()).toEqual([inside]);
  });

  it("requires a session", async () => {
    const ctx = await projectWithRelations();
    mockAnonymousSession();

    const response = await getProjectRelations(ctx.project.id);

    expect(response.status).toBe(401);
  });
});
