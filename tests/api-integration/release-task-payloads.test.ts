import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

type BoardTask = { id: string; releaseId: string | null };
type Board = {
  data: {
    columns: { tasks: BoardTask[] }[];
    plannedTasks: BoardTask[];
    archivedTasks: BoardTask[];
  };
};

const boardTasks = ({ data }: Board) =>
  [
    ...data.columns.flatMap((column) => column.tasks),
    ...data.plannedTasks,
    ...data.archivedTasks,
  ].sort((a, b) => a.id.localeCompare(b.id));

async function setup() {
  const member = await createWorkspaceMember({ role: "member" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const release = await insertRelease(project.id, { name: "2.4" });
  const other = await insertRelease(project.id, { name: "2.5" });
  const feature = await insertTask(project.id, {
    type: "feature",
    releaseId: release.id,
  });
  const task = await insertTask(project.id, {
    featureId: feature.id,
    releaseId: release.id,
  });
  const planned = await insertTask(project.id, {
    status: "planned",
    releaseId: other.id,
  });
  const loose = await insertTask(project.id);
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const get = async (path: string) => {
    const response = await app.request(`/api${path}`);
    expect(response.status, path).toBe(200);
    return response.json();
  };
  return { project, release, other, feature, task, planned, loose, get };
}

describe("releaseId in task payloads", () => {
  it("carries each task's release on the board, in task reads and in the feature list", async () => {
    const ctx = await setup();

    const board = boardTasks(await ctx.get(`/task/tasks/${ctx.project.id}`));
    expect(board.map(({ id, releaseId }) => ({ id, releaseId }))).toEqual(
      [
        { id: ctx.task.id, releaseId: ctx.release.id },
        { id: ctx.planned.id, releaseId: ctx.other.id },
        { id: ctx.loose.id, releaseId: null },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );

    for (const view of ["", "?view=board"]) {
      expect(await ctx.get(`/task/${ctx.task.id}${view}`)).toMatchObject({
        releaseId: ctx.release.id,
      });
      expect(await ctx.get(`/task/${ctx.loose.id}${view}`)).toMatchObject({
        releaseId: null,
      });
    }

    expect(await ctx.get(`/task/features/${ctx.project.id}`)).toEqual([
      expect.objectContaining({
        id: ctx.feature.id,
        releaseId: null,
        status: null,
      }),
    ]);
  });

  it("filters the task list by release, or by none", async () => {
    const ctx = await setup();
    const ids = async (releaseId: string) =>
      boardTasks(
        await ctx.get(`/task/tasks/${ctx.project.id}?releaseId=${releaseId}`),
      ).map(({ id }) => id);

    expect(await ids(ctx.release.id)).toEqual([ctx.task.id]);
    expect(await ids(ctx.other.id)).toEqual([ctx.planned.id]);
    expect(await ids("none")).toEqual([ctx.loose.id]);
    expect(await ids("unknown-release")).toEqual([]);
  });

  it("hides releases on the public board and ignores a release filter there", async () => {
    const ctx = await setup();
    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, ctx.project.id));

    const response = await createApp().app.request(
      `/api/public-project/${ctx.project.id}?releaseId=none`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const tasks = [
      ...body.columns.flatMap((column: { tasks: BoardTask[] }) => column.tasks),
      ...body.plannedTasks,
      ...body.archivedTasks,
    ];
    expect(tasks).toHaveLength(3);
    for (const task of tasks) expect(task.releaseId).toBeNull();
    expect(JSON.stringify(body)).not.toContain(ctx.release.id);
  });
});
