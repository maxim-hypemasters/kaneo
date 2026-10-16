import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { projectAccessApi } from "./helpers/project-access/project-access-api";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

beforeEach(resetTestDatabase);

type Activity = { type: string; eventData: Record<string, unknown> | null };

// A task in Alpha joins Alpha's "Acquire Contoso" feature, then moves to
// Beta. Its activity goes with it, so a member who sees only Beta reads it.
async function moveFeatureTaskToBeta() {
  const ctx = await createRestrictedWorkspace();
  const betaOnly = await addWorkspaceMember(ctx.workspace.id);
  await restrictToProjects(ctx.workspace.id, betaOnly.id, [ctx.beta.id]);
  const [feature] = await db
    .insert(schema.taskTable)
    .values({
      projectId: ctx.alpha.id,
      title: "Acquire Contoso",
      type: "feature",
      number: 2,
    })
    .returning();
  // Written before feature_changed events stored their project.
  await db.insert(schema.activityTable).values({
    taskId: ctx.alphaTask.id,
    type: "feature_changed",
    eventData: {
      oldFeatureId: null,
      oldFeatureTitle: null,
      newFeatureId: feature.id,
      newFeatureTitle: "Acquire Contoso",
    },
  });

  mockAuthenticatedSession(ctx.owner);
  const request = projectAccessApi();
  const joined = await request(`/task/feature/${ctx.alphaTask.id}`, {
    method: "PUT",
    body: { featureId: feature.id },
  });
  expect(joined.status).toBe(200);
  const moved = await request(`/task/move/${ctx.alphaTask.id}`, {
    method: "PUT",
    body: { destinationProjectId: ctx.beta.id },
  });
  expect(moved.status).toBe(200);
  // The move's own entry is written from its event.
  await vi.waitFor(async () => {
    const response = await request(`/activity/${ctx.alphaTask.id}`);
    const activities = (await response.json()) as Activity[];
    expect(activities.map((activity) => activity.type)).toContain("moved");
  });

  return { ...ctx, betaOnly, feature, request };
}

describe("feature activity across projects", () => {
  it("hides a private project's feature titles from a task's activity", async () => {
    const ctx = await moveFeatureTaskToBeta();

    const asOwner = (await (
      await ctx.request(`/activity/${ctx.alphaTask.id}`)
    ).json()) as Activity[];
    expect(
      asOwner
        .filter((activity) => activity.type === "feature_changed")
        .map((activity) => activity.eventData),
    ).toEqual([
      {
        projectId: ctx.alpha.id,
        oldFeatureId: ctx.feature.id,
        oldFeatureTitle: "Acquire Contoso",
        newFeatureId: null,
        newFeatureTitle: null,
      },
      {
        projectId: ctx.alpha.id,
        oldFeatureId: null,
        oldFeatureTitle: null,
        newFeatureId: ctx.feature.id,
        newFeatureTitle: "Acquire Contoso",
      },
      // The older entry can't tell its feature's project once the task left
      // it, so it is hidden from everyone.
      {
        oldFeatureId: null,
        oldFeatureTitle: null,
        newFeatureId: ctx.feature.id,
        newFeatureTitle: null,
      },
    ]);

    mockAuthenticatedSession(ctx.betaOnly);
    const response = await ctx.request(`/activity/${ctx.alphaTask.id}`);
    expect(response.status).toBe(200);
    const activities = (await response.json()) as Activity[];
    const changes = activities.filter(
      (activity) => activity.type === "feature_changed",
    );
    expect(changes.map((activity) => activity.eventData)).toEqual([
      {
        projectId: null,
        oldFeatureId: ctx.feature.id,
        oldFeatureTitle: null,
        newFeatureId: null,
        newFeatureTitle: null,
      },
      {
        projectId: null,
        oldFeatureId: null,
        oldFeatureTitle: null,
        newFeatureId: ctx.feature.id,
        newFeatureTitle: null,
      },
      {
        oldFeatureId: null,
        oldFeatureTitle: null,
        newFeatureId: ctx.feature.id,
        newFeatureTitle: null,
      },
    ]);
    const body = JSON.stringify(activities);
    expect(body).not.toContain("Contoso");
    expect(body).not.toContain(ctx.alpha.id);
  });

  it("hides them from the workspace feed and from search", async () => {
    const ctx = await moveFeatureTaskToBeta();
    const search = (q: string) =>
      ctx.request(
        `/search?${new URLSearchParams({ q, workspaceId: ctx.workspace.id, type: "activities" })}`,
      );

    const ownerResults = (await (await search("Contoso")).json()) as {
      results: { content?: string }[];
    };
    expect(ownerResults.results.map((result) => result.content)).toEqual(
      expect.arrayContaining(['added the task to feature "Acquire Contoso"']),
    );

    mockAuthenticatedSession(ctx.betaOnly);
    const feed = await ctx.request(`/activity/workspace/${ctx.workspace.id}`);
    expect(feed.status).toBe(200);
    const entries = (await feed.json()) as (Activity & { taskId: string })[];
    expect(
      entries.filter((entry) => entry.type === "feature_changed"),
    ).toHaveLength(3);
    expect(JSON.stringify(entries)).not.toContain("Contoso");

    const hidden = await search("Contoso");
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toMatchObject({ results: [] });

    // Found through the task's title, the entry shows without the title.
    const byTask = (await (await search("Visible alpha")).json()) as {
      results: { type: string; content?: string }[];
    };
    const contents = byTask.results
      .filter((result) => result.type === "activity")
      .map((result) => result.content);
    expect(contents).toContain("added the task to a feature");
    expect(JSON.stringify(byTask)).not.toContain("Contoso");
  });

  it("keeps an older entry's title while the task is still in its feature's project", async () => {
    const ctx = await createRestrictedWorkspace();
    const [feature] = await db
      .insert(schema.taskTable)
      .values({
        projectId: ctx.alpha.id,
        title: "Acquire Contoso",
        type: "feature",
        number: 2,
      })
      .returning();
    await db.insert(schema.activityTable).values({
      taskId: ctx.alphaTask.id,
      type: "feature_changed",
      eventData: {
        oldFeatureId: null,
        oldFeatureTitle: null,
        newFeatureId: feature.id,
        newFeatureTitle: "Acquire Contoso",
      },
    });

    mockAuthenticatedSession(ctx.restricted);
    const activities = (await (
      await projectAccessApi()(`/activity/${ctx.alphaTask.id}`)
    ).json()) as Activity[];

    expect(activities.map((activity) => activity.eventData)).toEqual([
      expect.objectContaining({ newFeatureTitle: "Acquire Contoso" }),
    ]);
  });
});
