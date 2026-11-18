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
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(resetTestDatabase);

async function insertMilestone(
  featureId: string,
  values: Partial<typeof schema.milestoneTable.$inferInsert> = {},
) {
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({ featureId, title: "Checkpoint", ...values })
    .returning();
  return milestone!;
}

async function setup() {
  const ctx = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: ctx.workspace.id,
  });
  const feature = await insertTask(project.id, {
    type: "feature",
    title: "Checkout",
  });
  const milestone = await insertMilestone(feature.id, { title: "Beta" });
  const bug = await insertTask(project.id, { type: "bug", title: "Crash" });
  mockAuthenticatedSession(ctx.user);
  const app = createApp().app;
  const request = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api/test-case${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const create = async (body: Record<string, unknown>) => {
    const response = await request("POST", `/project/${project.id}`, body);
    expect(response.status).toBe(200);
    return (await response.json()) as {
      id: string;
      milestone: { id: string; featureTitle: string } | null;
      bug: { id: string; type: string } | null;
    };
  };
  const list = async (path: string) => {
    const response = await request("GET", path);
    expect(response.status).toBe(200);
    return (await response.json()) as {
      data: { id: string; title: string; status: string }[];
      pagination: { total: number };
      statusCounts: Record<string, number>;
    };
  };
  return { ...ctx, project, feature, milestone, bug, request, create, list };
}

describe("test cases", () => {
  it("creates, reads, updates and deletes a test case", async () => {
    const ctx = await setup();
    const created = await ctx.create({
      title: "  Pay with a saved card ",
      description: "Signed in",
      steps: "1. Open checkout\n2. Pay",
      expectedResult: "Order is placed",
      milestoneId: ctx.milestone.id,
      bugId: ctx.bug.id,
    });
    expect(created).toMatchObject({
      title: "Pay with a saved card",
      status: "not_run",
      description: "Signed in",
      milestone: {
        id: ctx.milestone.id,
        title: "Beta",
        featureId: ctx.feature.id,
        featureTitle: "Checkout",
      },
      bug: { id: ctx.bug.id, title: "Crash", type: "bug" },
    });

    const updated = await ctx.request("PATCH", `/${created.id}`, {
      status: "failed",
      bugId: null,
      steps: null,
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      status: "failed",
      bugId: null,
      bug: null,
      steps: null,
      milestoneId: ctx.milestone.id,
    });

    expect((await ctx.request("PATCH", `/${created.id}`, {})).status).toBe(400);
    expect((await ctx.request("DELETE", `/${created.id}`)).status).toBe(200);
    expect((await ctx.request("GET", `/${created.id}`)).status).toBe(404);
  });

  it("lists with filters, leaves out long text and counts statuses", async () => {
    const ctx = await setup();
    await ctx.create({ title: "Linked", milestoneId: ctx.milestone.id });
    await ctx.create({ title: "Passing", status: "passed", steps: "Long" });
    await ctx.create({ title: "Failing 100%", status: "failed" });

    const all = await ctx.list(`/project/${ctx.project.id}`);
    expect(all.data.map((row) => row.title)).toEqual([
      "Linked",
      "Passing",
      "Failing 100%",
    ]);
    expect(all.data[1]).not.toHaveProperty("steps");
    expect(all.statusCounts).toEqual({
      not_run: 1,
      passed: 1,
      failed: 1,
      blocked: 0,
    });

    const failed = await ctx.list(`/project/${ctx.project.id}?status=failed`);
    expect(failed.data.map((row) => row.title)).toEqual(["Failing 100%"]);
    expect(failed.pagination.total).toBe(1);
    expect(failed.statusCounts.passed).toBe(1);

    const unlinked = await ctx.list(
      `/project/${ctx.project.id}?milestoneId=none`,
    );
    expect(unlinked.data).toHaveLength(2);
    const linked = await ctx.list(
      `/project/${ctx.project.id}?milestoneId=${ctx.milestone.id}`,
    );
    expect(linked.data.map((row) => row.title)).toEqual(["Linked"]);
    const searched = await ctx.list(
      `/project/${ctx.project.id}?search=${encodeURIComponent("100%")}`,
    );
    expect(searched.data.map((row) => row.title)).toEqual(["Failing 100%"]);
  });

  it("only links milestones and bugs from the same project", async () => {
    const ctx = await setup();
    const { project: other } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const otherFeature = await insertTask(other.id, { type: "feature" });
    const otherMilestone = await insertMilestone(otherFeature.id);
    const otherBug = await insertTask(other.id, { type: "bug" });
    const task = await insertTask(ctx.project.id, { type: "task" });
    const path = `/project/${ctx.project.id}`;

    expect(
      (await ctx.request("POST", path, { title: "x", bugId: otherBug.id }))
        .status,
    ).toBe(404);
    expect(
      (
        await ctx.request("POST", path, {
          title: "x",
          milestoneId: otherMilestone.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (await ctx.request("POST", path, { title: "x", bugId: task.id })).status,
    ).toBe(400);
    expect(
      (await ctx.request("POST", path, { title: "x", bugId: ctx.feature.id }))
        .status,
    ).toBe(400);
  });

  it("lists a Feature's test cases in milestone order", async () => {
    const ctx = await setup();
    const first = await insertMilestone(ctx.feature.id, {
      title: "Alpha",
      position: -1,
    });
    const otherFeature = await insertTask(ctx.project.id, { type: "feature" });
    const elsewhere = await insertMilestone(otherFeature.id);
    await ctx.create({ title: "On beta", milestoneId: ctx.milestone.id });
    await ctx.create({ title: "On alpha", milestoneId: first.id });
    await ctx.create({ title: "Elsewhere", milestoneId: elsewhere.id });
    await ctx.create({ title: "Only a bug", bugId: ctx.bug.id });

    const listed = await ctx.list(`/feature/${ctx.feature.id}`);
    expect(listed.data.map((row) => row.title)).toEqual([
      "On alpha",
      "On beta",
    ]);
    expect((await ctx.request("GET", `/feature/${ctx.bug.id}`)).status).toBe(
      404,
    );
  });

  it("lists a release's test cases from its milestones and bugs", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id);
    const later = await insertRelease(ctx.project.id);
    await db
      .update(schema.milestoneTable)
      .set({ releaseId: release.id })
      .where(eq(schema.milestoneTable.id, ctx.milestone.id));
    // Same Feature, planned for another release: its test cases stay out,
    // even though the Feature has work in this release.
    const sibling = await insertMilestone(ctx.feature.id, {
      releaseId: later.id,
    });
    const bugInRelease = await insertTask(ctx.project.id, {
      type: "bug",
      featureId: ctx.feature.id,
      releaseId: release.id,
    });
    const archivedBug = await insertTask(ctx.project.id, {
      type: "bug",
      status: "archived",
      releaseId: release.id,
    });
    await ctx.create({ title: "Milestone", milestoneId: ctx.milestone.id });
    await ctx.create({ title: "Bug", bugId: bugInRelease.id });
    await ctx.create({ title: "Sibling", milestoneId: sibling.id });
    await ctx.create({ title: "Archived", bugId: archivedBug.id });
    await ctx.create({ title: "Loose" });

    const listed = await ctx.list(`/release/${release.id}`);
    expect(listed.data.map((row) => row.title)).toEqual(["Milestone", "Bug"]);
    expect(listed.statusCounts.not_run).toBe(2);
  });

  it("keeps a test case when its links are deleted", async () => {
    const ctx = await setup();
    const created = await ctx.create({
      title: "Survives",
      milestoneId: ctx.milestone.id,
      bugId: ctx.bug.id,
    });
    await db
      .delete(schema.taskTable)
      .where(eq(schema.taskTable.id, ctx.bug.id));
    await db
      .delete(schema.taskTable)
      .where(eq(schema.taskTable.id, ctx.feature.id));
    const response = await ctx.request("GET", `/${created.id}`);
    expect(await response.json()).toMatchObject({
      milestoneId: null,
      bugId: null,
      milestone: null,
      bug: null,
    });
  });
});
