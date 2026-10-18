import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp } from "../../apps/api/src/index";
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
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

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

const dates = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
};

async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const { project: otherProject } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  return { ...member, project, otherProject, app };
}

const releaseEvents = () =>
  publish.mock.calls.filter(([event]) => event === "release.changed");

// The tasks announced by task.updated, in order.
const updatedTasks = () =>
  publish.mock.calls
    .filter(([event]) => event === "task.updated")
    .map(([, data]) => (data as { taskId: string }).taskId);

describe("release events", () => {
  it("publishes release.changed once for each create and update", async () => {
    const ctx = await setup();

    const created = await ctx.app.request(
      `/api/release/project/${ctx.project.id}`,
      jsonRequest("POST", { name: "2.4", ...dates }),
    );
    expect(created.status).toBe(200);
    const { id } = await created.json();
    expect(releaseEvents()).toEqual([
      ["release.changed", { projectId: ctx.project.id }],
    ]);

    publish.mockClear();
    const updated = await ctx.app.request(
      `/api/release/${id}`,
      jsonRequest("PUT", { name: "2.4.1" }),
    );
    expect(updated.status).toBe(200);
    expect(releaseEvents()).toEqual([
      ["release.changed", { projectId: ctx.project.id }],
    ]);
  });

  it("publishes nothing when a create or update is refused", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id, { name: "2.4" });
    const other = await insertRelease(ctx.project.id, { name: "2.5" });
    const create = (body: unknown) =>
      ctx.app.request(
        `/api/release/project/${ctx.project.id}`,
        jsonRequest("POST", body),
      );
    const update = (id: string, body: unknown) =>
      ctx.app.request(`/api/release/${id}`, jsonRequest("PUT", body));

    expect((await create({ name: "2.4", ...dates })).status).toBe(409);
    expect(
      (await create({ name: "2.6", ...dates, startDate: "2026-10-16" })).status,
    ).toBe(400);
    expect((await update(other.id, { name: "2.4" })).status).toBe(409);
    expect(
      (await update(release.id, { submissionDate: "2026-10-14" })).status,
    ).toBe(400);
    expect((await update("missing", { name: "x" })).status).toBe(404);

    expect(releaseEvents()).toEqual([]);
  });
});

describe("membership events", () => {
  it("announces a feature and each task that followed it", async () => {
    const ctx = await setup();
    const from = await insertRelease(ctx.project.id, { name: "2.4" });
    const to = await insertRelease(ctx.project.id, { name: "2.5" });
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: from.id,
    });
    const followers = [
      await insertTask(ctx.project.id, {
        featureId: feature.id,
        releaseId: from.id,
      }),
      await insertTask(ctx.project.id, {
        featureId: feature.id,
        releaseId: from.id,
      }),
    ];
    await insertTask(ctx.project.id, { featureId: feature.id });

    const response = await ctx.app.request(
      `/api/task/release/${feature.id}`,
      jsonRequest("PUT", { releaseId: to.id }),
    );

    expect(response.status).toBe(200);
    expect(updatedTasks()).toEqual([
      feature.id,
      ...followers.map(({ id }) => id).sort(),
    ]);
    expect(publish).toHaveBeenCalledWith("task.updated", {
      taskId: feature.id,
      projectId: ctx.project.id,
      userId: ctx.user.id,
    });
    // Membership isn't a change to the release itself.
    expect(releaseEvents()).toEqual([]);
  });

  it("announces nothing when the task is already in that release", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id, { name: "2.4" });
    const task = await insertTask(ctx.project.id, { releaseId: release.id });

    const response = await ctx.app.request(
      `/api/task/release/${task.id}`,
      jsonRequest("PUT", { releaseId: release.id }),
    );

    expect(response.status).toBe(200);
    expect(updatedTasks()).toEqual([]);
  });

  it("announces each member of a deleted release, and the release once", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id, { name: "2.4" });
    const members = [
      await insertTask(ctx.project.id, { releaseId: release.id }),
      await insertTask(ctx.project.id, {
        type: "feature",
        releaseId: release.id,
      }),
    ];

    const response = await ctx.app.request(`/api/release/${release.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(updatedTasks()).toEqual(members.map(({ id }) => id).sort());
    expect(releaseEvents()).toEqual([
      ["release.changed", { projectId: ctx.project.id }],
    ]);
  });

  it("announces each moved item, and the release once", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id, { name: "2.4" });
    const next = await insertRelease(ctx.project.id, { name: "2.5" });
    const unfinished = [
      await insertTask(ctx.project.id, { releaseId: release.id }),
      await insertTask(ctx.project.id, {
        releaseId: release.id,
        status: "planned",
      }),
    ];
    await insertTask(ctx.project.id, {
      releaseId: release.id,
      status: "archived",
    });

    const response = await ctx.app.request(
      `/api/release/${release.id}/move-unfinished`,
      jsonRequest("POST", { targetReleaseId: next.id }),
    );

    expect(response.status).toBe(200);
    expect(updatedTasks()).toEqual(unfinished.map(({ id }) => id).sort());
    expect(releaseEvents()).toEqual([
      ["release.changed", { projectId: ctx.project.id }],
    ]);
  });

  it("announces nothing when a delete or move is refused", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id, { name: "2.4" });
    const elsewhere = await insertRelease(ctx.otherProject.id, {
      name: "Other",
    });
    await insertTask(ctx.project.id, { releaseId: release.id });
    const move = (targetReleaseId: string | null) =>
      ctx.app.request(
        `/api/release/${release.id}/move-unfinished`,
        jsonRequest("POST", { targetReleaseId }),
      );

    expect((await move(release.id)).status).toBe(400);
    expect((await move(elsewhere.id)).status).toBe(404);
    expect(
      (await ctx.app.request("/api/release/missing", { method: "DELETE" }))
        .status,
    ).toBe(404);

    expect(updatedTasks()).toEqual([]);
    expect(releaseEvents()).toEqual([]);
  });
});

describe("live release updates", () => {
  async function watch(
    projectId: string,
    userId: string,
    initiatorId: string,
    workspaceId: string,
  ) {
    const send = vi.fn();
    const connection = addConnection(
      projectId,
      { send } as never,
      userId,
      initiatorId,
      workspaceId,
    );
    return {
      messages: () =>
        send.mock.calls.map(([message]) => JSON.parse(message as string)),
      stop: () => removeConnection(projectId, connection),
    };
  }

  it("sends RELEASES_UPDATED to the project's other windows only", async () => {
    const ctx = await setup();
    const release = await insertRelease(ctx.project.id, { name: "2.4" });
    await initializeWebSocketAdapter();
    const watching = await watch(
      ctx.project.id,
      ctx.user.id,
      `${ctx.user.id}:watching`,
      ctx.workspace.id,
    );
    const editing = await watch(
      ctx.project.id,
      ctx.user.id,
      `${ctx.user.id}:editing`,
      ctx.workspace.id,
    );
    const elsewhere = await watch(
      ctx.otherProject.id,
      ctx.user.id,
      `${ctx.user.id}:elsewhere`,
      ctx.workspace.id,
    );
    const fromEditingWindow = { "X-Kaneo-Window-Id": "editing" };
    try {
      const updated = await ctx.app.request(
        `/api/release/${release.id}`,
        jsonRequest("PUT", { description: "Notes" }, fromEditingWindow),
      );
      expect(updated.status).toBe(200);
      const created = await ctx.app.request(
        `/api/release/project/${ctx.project.id}`,
        jsonRequest("POST", { name: "2.5", ...dates }, fromEditingWindow),
      );
      expect(created.status).toBe(200);

      const expected = { type: "RELEASES_UPDATED", projectId: ctx.project.id };
      await vi.waitFor(() =>
        expect(watching.messages()).toContainEqual(expected),
      );
      // Changes within one 100ms flush collapse into one message.
      for (const message of watching.messages())
        expect(message).toEqual(expected);
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
