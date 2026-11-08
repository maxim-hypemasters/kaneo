import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { insertTask } from "./helpers/release/insert-task";

const m = vi.hoisted(() => ({ publish: vi.fn(async () => undefined) }));
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<object>()),
  publishEvent: m.publish,
}));
beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});

function link(body: {
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
}) {
  return createApp().app.request("/api/task-relation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function setup() {
  const member = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const feature = await insertTask(project.id, { type: "feature" });
  const task = await insertTask(project.id);
  const bug = await insertTask(project.id, { type: "bug" });
  mockAuthenticatedSession(member.user);
  return { ...member, project, feature, task, bug };
}

describe("relations with Features", () => {
  it.each(["blocks", "related"])(
    "refuses a Feature on either end of a %s relation, writing and announcing nothing",
    async (relationType) => {
      const ctx = await setup();
      for (const [sourceTaskId, targetTaskId] of [
        [ctx.feature.id, ctx.task.id],
        [ctx.bug.id, ctx.feature.id],
      ]) {
        const response = await link({
          sourceTaskId,
          targetTaskId,
          relationType,
        });
        expect(response.status).toBe(400);
        expect(await readErrorBody(response)).toMatchObject({
          message: "Features do not have relations",
        });
      }
      expect(await db.query.taskRelationTable.findMany()).toHaveLength(0);
      expect(m.publish).not.toHaveBeenCalled();
    },
  );

  it("still links a Task and a Bug", async () => {
    const ctx = await setup();
    const response = await link({
      sourceTaskId: ctx.task.id,
      targetTaskId: ctx.bug.id,
      relationType: "blocks",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sourceTaskId: ctx.task.id,
      targetTaskId: ctx.bug.id,
      relationType: "blocks",
    });
    expect(m.publish).toHaveBeenCalledWith(
      "task-relation.created",
      expect.objectContaining({ sourceTaskId: ctx.task.id }),
    );
  });

  it("still puts a task into a Feature through the deprecated subtask relation", async () => {
    const ctx = await setup();
    const response = await link({
      sourceTaskId: ctx.feature.id,
      targetTaskId: ctx.task.id,
      relationType: "subtask",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: `feature:${ctx.task.id}:${ctx.feature.id}`,
      relationType: "subtask",
    });
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, ctx.task.id),
      }),
    ).toMatchObject({ featureId: ctx.feature.id });
    expect(await db.query.taskRelationTable.findMany()).toHaveLength(0);
  });

  it("answers a hidden Feature target with 403, not with what it is", async () => {
    const ctx = await createRestrictedWorkspace();
    const hidden = await insertTask(ctx.beta.id, { type: "feature" });
    mockAuthenticatedSession(ctx.restricted);

    const response = await link({
      sourceTaskId: ctx.alphaTask.id,
      targetTaskId: hidden.id,
      relationType: "related",
    });

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("Features");
    expect(await db.query.taskRelationTable.findMany()).toHaveLength(0);
  });

  it("is refused by the database too", async () => {
    const ctx = await setup();
    await expect(
      db.insert(schema.taskRelationTable).values({
        sourceTaskId: ctx.task.id,
        targetTaskId: ctx.feature.id,
        relationType: "related",
      }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
