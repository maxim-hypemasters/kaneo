import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

type Result = {
  id: string;
  type: string;
  taskType?: string;
  taskId?: string;
  title: string;
  content?: string;
  archived?: boolean;
  status?: string;
  priority?: string;
};

async function setup() {
  const owner = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: owner.workspace.id,
    slug: "PAY",
  });
  const { project: hidden } = await createProjectFixture({
    workspaceId: owner.workspace.id,
    slug: "HID",
  });
  const feature = await insertTask(project.id, {
    type: "feature",
    title: "Payments checkout",
  });
  const archived = await insertTask(project.id, {
    type: "feature",
    title: "Payments legacy",
    archivedAt: new Date(),
  });
  const task = await insertTask(project.id, {
    title: "Payments retry task",
    priority: "high",
  });
  const bug = await insertTask(project.id, {
    type: "bug",
    title: "Payments double charge",
    priority: "urgent",
  });
  const hiddenFeature = await insertTask(hidden.id, {
    type: "feature",
    title: "Payments secret",
  });
  const [comment, created] = await db
    .insert(schema.activityTable)
    .values([
      {
        taskId: feature.id,
        type: "comment",
        userId: owner.user.id,
        content: "Ledger rollout is next",
      },
      { taskId: feature.id, type: "created", userId: owner.user.id },
    ])
    .returning();
  const app = createApp().app;
  const search = async (q: string, type?: string) => {
    const params = new URLSearchParams({ q, workspaceId: owner.workspace.id });
    if (type) params.set("type", type);
    const response = await app.request(`/api/search?${params}`);
    const body = (await response.json()) as { results: Result[] };
    return body.results;
  };
  return {
    owner,
    project,
    feature,
    archived,
    task,
    bug,
    hiddenFeature,
    comment: comment!,
    created: created!,
    search,
  };
}

const ids = (results: Result[]) => results.map((result) => result.id).sort();

describe("Feature search", () => {
  it("returns Features as their own result type, without workflow fields", async () => {
    const ctx = await setup();
    mockAuthenticatedSession(ctx.owner.user);

    const features = await ctx.search("payments", "features");
    expect(ids(features)).toEqual(
      [ctx.feature.id, ctx.archived.id, ctx.hiddenFeature.id].sort(),
    );
    const active = features.find((result) => result.id === ctx.feature.id);
    expect(active).toMatchObject({
      type: "feature",
      taskType: "feature",
      archived: false,
    });
    expect(active).not.toHaveProperty("status");
    expect(active).not.toHaveProperty("priority");
    expect(
      features.find((result) => result.id === ctx.archived.id),
    ).toMatchObject({ type: "feature", archived: true });
  });

  it("keeps tasks to Tasks and Bugs, and all to every kind", async () => {
    const ctx = await setup();
    mockAuthenticatedSession(ctx.owner.user);

    const tasks = await ctx.search("payments", "tasks");
    expect(ids(tasks)).toEqual([ctx.task.id, ctx.bug.id].sort());
    expect(tasks.every((result) => result.type === "task")).toBe(true);
    expect(tasks.find((result) => result.id === ctx.bug.id)).toMatchObject({
      taskType: "bug",
      priority: "urgent",
    });

    const all = await ctx.search("payments");
    expect(ids(all.filter((result) => result.type === "feature"))).toHaveLength(
      3,
    );
    expect(ids(all.filter((result) => result.type === "task"))).toEqual(
      [ctx.task.id, ctx.bug.id].sort(),
    );
  });

  it("finds a Feature by its key only outside the tasks filter", async () => {
    const ctx = await setup();
    mockAuthenticatedSession(ctx.owner.user);
    const key = `PAY-${ctx.feature.number}`;

    expect(await ctx.search(key, "tasks")).toEqual([]);
    expect((await ctx.search(key, "features"))[0]).toMatchObject({
      id: ctx.feature.id,
      type: "feature",
    });
  });

  it("links comment and activity results to the Feature they belong to", async () => {
    const ctx = await setup();
    mockAuthenticatedSession(ctx.owner.user);

    const [comment] = await ctx.search("ledger", "comments");
    expect(comment).toMatchObject({
      id: ctx.comment.id,
      type: "comment",
      taskId: ctx.feature.id,
      taskType: "feature",
      title: "Comment on Payments checkout",
    });

    const activities = await ctx.search("checkout", "activities");
    expect(
      activities.find((result) => result.id === ctx.created.id),
    ).toMatchObject({
      type: "activity",
      taskId: ctx.feature.id,
      taskType: "feature",
      title: "Created Payments checkout",
      content: "created the feature",
    });
  });

  it("keeps Features to projects the searcher can open", async () => {
    const ctx = await setup();
    const member = await createWorkspaceMember();
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: ctx.owner.workspace.id,
      userId: member.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    await restrictToProjects(ctx.owner.workspace.id, member.user.id, [
      ctx.project.id,
    ]);
    mockAuthenticatedSession(member.user);

    const features = await ctx.search("payments", "features");
    expect(ids(features)).toEqual([ctx.feature.id, ctx.archived.id].sort());
    expect(
      await ctx.search(`HID-${ctx.hiddenFeature.number}`, "features"),
    ).toEqual([]);
  });
});
