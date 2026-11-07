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

async function setup() {
  const owner = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: owner.workspace.id,
    slug: "DOC",
  });
  const { project: hidden } = await createProjectFixture({
    workspaceId: owner.workspace.id,
    slug: "HID",
  });
  const feature = await insertTask(project.id, {
    type: "feature",
    title: "Checkout",
  });
  const hiddenFeature = await insertTask(hidden.id, {
    type: "feature",
    title: "Billing",
  });
  const [titled, mentioned, secret] = await db
    .insert(schema.featureDocumentTable)
    .values([
      { featureId: feature.id, title: "Retry rollout", body: "Plan" },
      {
        featureId: feature.id,
        title: "Notes",
        body: "## Payments\n\nStage the **retry** behind a flag.",
      },
      { featureId: hiddenFeature.id, title: "Retry costs", body: "" },
    ])
    .returning();
  const app = createApp().app;
  const search = async (q: string, type?: string) => {
    const params = new URLSearchParams({ q, workspaceId: owner.workspace.id });
    if (type) params.set("type", type);
    const response = await app.request(`/api/search?${params}`);
    return { status: response.status, body: await response.json() };
  };
  return {
    owner,
    project,
    hidden,
    feature,
    titled: titled!,
    mentioned: mentioned!,
    secret: secret!,
    search,
  };
}

describe("Feature document search", () => {
  it("finds documents by title or text, with their Feature and an excerpt", async () => {
    const ctx = await setup();
    mockAuthenticatedSession(ctx.owner.user);

    const { body } = await ctx.search("retry", "documents");
    const documents = body.results.filter(
      (result: { type: string }) => result.type === "document",
    );
    // Title matches rank above text matches; equal scores keep no set order.
    const ids = documents.map((result: { id: string }) => result.id);
    expect(ids.slice(0, 2).sort()).toEqual(
      [ctx.titled.id, ctx.secret.id].sort(),
    );
    expect(ids[2]).toBe(ctx.mentioned.id);
    expect(
      documents.find(
        (result: { id: string }) => result.id === ctx.mentioned.id,
      ),
    ).toMatchObject({
      title: "Notes",
      content: "Payments Stage the retry behind a flag.",
      featureId: ctx.feature.id,
      featureTitle: "Checkout",
      projectId: ctx.project.id,
      projectSlug: "DOC",
    });
    expect(body.results).toHaveLength(3);

    const all = await ctx.search("retry");
    expect(
      all.body.results.filter(
        (result: { type: string }) => result.type === "document",
      ),
    ).toHaveLength(3);
    expect((await ctx.search("retry", "tasks")).body.results).toEqual([]);
  });

  it("keeps documents to projects the searcher can open", async () => {
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
    const ids = (await ctx.search("retry", "documents")).body.results.map(
      (result: { id: string }) => result.id,
    );
    expect(ids).toEqual([ctx.titled.id, ctx.mentioned.id]);
    expect(ids).not.toContain(ctx.secret.id);

    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    const outside = await ctx.search("retry", "documents");
    expect(outside.status).not.toBe(200);
  });
});
