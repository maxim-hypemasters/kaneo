import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { projectAccessApi } from "./helpers/project-access/project-access-api";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

const dates = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
};

function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return createApp().app.request(`/api${path}`, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

type Target = { projectId: string; releaseId: string; taskId: string };

// Each release route, in the order the expectations below list them: list,
// get, create, update, set a task's release, move unfinished, delete.
function routes({ projectId, releaseId, taskId }: Target) {
  return [
    ["GET", `/release/project/${projectId}`, undefined],
    ["GET", `/release/${releaseId}`, undefined],
    [
      "POST",
      `/release/project/${projectId}`,
      { name: `New ${randomUUID()}`, ...dates },
    ],
    ["PUT", `/release/${releaseId}`, { description: "Edited" }],
    ["PUT", `/task/release/${taskId}`, { releaseId }],
    [
      "POST",
      `/release/${releaseId}/move-unfinished`,
      { targetReleaseId: null },
    ],
    ["DELETE", `/release/${releaseId}`, undefined],
  ] as const;
}

async function statuses(target: Target, headers?: Record<string, string>) {
  const result: number[] = [];
  for (const [method, path, body] of routes(target)) {
    result.push((await request(method, path, body, headers)).status);
  }
  return result;
}

async function fixture(role: string) {
  const member = await createWorkspaceMember({ role });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const release = await insertRelease(project.id, { name: "2.4" });
  const task = await insertTask(project.id);
  const target = {
    projectId: project.id,
    releaseId: release.id,
    taskId: task.id,
  };
  return { ...member, project, release, task, target };
}

async function releaseRows() {
  return db
    .select({
      name: schema.releaseTable.name,
      description: schema.releaseTable.description,
    })
    .from(schema.releaseTable);
}

describe("release permissions", () => {
  it.each([
    ["viewer", [200, 200, 403, 403, 403, 403, 403]],
    ["member", [200, 200, 403, 403, 200, 200, 403]],
    ["admin", [200, 200, 200, 200, 200, 200, 200]],
    ["owner", [200, 200, 200, 200, 200, 200, 200]],
  ] as const)("gives a %s %j", async (role, expected) => {
    const ctx = await fixture(role);
    mockAuthenticatedSession(ctx.user);

    expect(await statuses(ctx.target)).toEqual(expected);
    if (expected[2] === 403) {
      expect(await releaseRows()).toEqual([{ name: "2.4", description: null }]);
    }
    const [task] = await db
      .select({ releaseId: schema.taskTable.releaseId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, ctx.task.id));
    // Set by the task route, then taken out again by move unfinished.
    expect(task?.releaseId).toBeNull();
  });

  for (const authentication of ["api-key", "custom-role"] as const) {
    it.each([
      [{}, [200, 200, 403, 403, 403, 403, 403]],
      [
        { project: ["read"], task: ["read"] },
        [200, 200, 403, 403, 403, 403, 403],
      ],
      [{ task: ["create", "update"] }, [200, 200, 403, 403, 200, 200, 403]],
      [{ project: ["update"] }, [200, 200, 200, 200, 403, 403, 403]],
      [
        { project: ["update"], task: ["update"] },
        [200, 200, 200, 200, 200, 200, 200],
      ],
    ] as [Record<string, string[]>, number[]][])(
      `${authentication} respects permission map %j`,
      async (permissions, expected) => {
        const ctx = await fixture(
          authentication === "custom-role" ? "limited" : "admin",
        );
        const headers: Record<string, string> = {};
        if (authentication === "custom-role") {
          await db.insert(schema.workspaceRoleTable).values({
            workspaceId: ctx.workspace.id,
            role: "limited",
            permission: JSON.stringify(permissions),
          });
          mockAuthenticatedSession(ctx.user);
        } else {
          mockAnonymousSession();
          const key = `kaneo_test_${randomUUID()}`;
          await db.insert(schema.apikeyTable).values({
            referenceId: ctx.user.id,
            userId: ctx.user.id,
            key: createHash("sha256").update(key).digest("base64url"),
            name: "scoped test key",
            createdAt: new Date(),
            updatedAt: new Date(),
            permissions: JSON.stringify(permissions),
            enabled: true,
          });
          headers.Authorization = `Bearer ${key}`;
        }

        expect(await statuses(ctx.target, headers)).toEqual(expected);
      },
    );
  }
});

describe("release access boundaries", () => {
  it("keeps a project-restricted member out of other projects' releases", async () => {
    const ctx = await createRestrictedWorkspace();
    await db
      .update(schema.workspaceUserTable)
      .set({ role: "admin" })
      .where(eq(schema.workspaceUserTable.userId, ctx.restricted.id));
    const visible = await insertRelease(ctx.alpha.id, { name: "Alpha 1" });
    const hidden = await insertRelease(ctx.beta.id, { name: "Beta 1" });
    mockAuthenticatedSession(ctx.restricted);

    expect(
      await statuses({
        projectId: ctx.alpha.id,
        releaseId: visible.id,
        taskId: ctx.alphaTask.id,
      }),
    ).toEqual([200, 200, 200, 200, 200, 200, 200]);
    for (const [method, path, body] of routes({
      projectId: ctx.beta.id,
      releaseId: hidden.id,
      taskId: ctx.betaTask.id,
    })) {
      const response = await request(method, path, body);
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(await response.text()).not.toContain("Beta 1");
    }
  });

  it("reads another workspace's release and project as missing", async () => {
    const ctx = await fixture("admin");
    const outsider = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(outsider.user);

    for (const [method, path, body] of routes(ctx.target)) {
      const response = await request(method, path, body);
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await response.text()).not.toContain("2.4");
    }
    expect(await releaseRows()).toEqual([{ name: "2.4", description: null }]);
  });

  it("rejects an anonymous caller", async () => {
    const ctx = await fixture("admin");
    mockAnonymousSession();
    expect(await statuses(ctx.target)).toEqual([
      401, 401, 401, 401, 401, 401, 401,
    ]);
  });
});

describe("release entitlement", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("blocks changing releases once a cloud plan expires, but not reading or deleting them", async () => {
    vi.stubEnv("KANEO_CLOUD", "true");
    vi.stubEnv("CREEM_API_KEY", "creem_test_dummy");
    vi.stubEnv("CREEM_WEBHOOK_SECRET", "whsec_dummy");
    const ctx = await fixture("owner");
    await db.insert(schema.workspaceBillingTable).values({
      workspaceId: ctx.workspace.id,
      foundingFree: false,
      trialEndsAt: new Date(Date.now() - 60_000),
    });
    mockAuthenticatedSession(ctx.user);

    expect(await statuses(ctx.target)).toEqual([
      200, 200, 402, 402, 402, 402, 200,
    ]);
    expect(await releaseRows()).toEqual([]);
  });
});

describe("release activity across projects", () => {
  type Activity = { type: string; eventData: Record<string, unknown> | null };

  // A task in Alpha joins Alpha's "Alpha 2.4" release, then moves to Beta,
  // which clears it. Its activity goes with it, so a member who sees only
  // Beta reads it.
  async function moveReleasedTaskToBeta() {
    const ctx = await createRestrictedWorkspace();
    const betaOnly = await addWorkspaceMember(ctx.workspace.id);
    await restrictToProjects(ctx.workspace.id, betaOnly.id, [ctx.beta.id]);
    const release = await insertRelease(ctx.alpha.id, { name: "Alpha 2.4" });
    mockAuthenticatedSession(ctx.owner);
    const api = projectAccessApi();
    const joined = await api(`/task/release/${ctx.alphaTask.id}`, {
      method: "PUT",
      body: { releaseId: release.id },
    });
    expect(joined.status).toBe(200);
    const moved = await api(`/task/move/${ctx.alphaTask.id}`, {
      method: "PUT",
      body: { destinationProjectId: ctx.beta.id },
    });
    expect(moved.status).toBe(200);
    return { ...ctx, betaOnly, release, api };
  }

  const releaseChanges = (activities: Activity[]) =>
    activities
      .filter((activity) => activity.type === "release_changed")
      .map((activity) => activity.eventData);

  it("hides a private project's release names from a task's activity", async () => {
    const ctx = await moveReleasedTaskToBeta();
    const read = async () =>
      (await (
        await ctx.api(`/activity/${ctx.alphaTask.id}`)
      ).json()) as Activity[];

    expect(releaseChanges(await read())).toEqual(
      expect.arrayContaining([
        {
          projectId: ctx.alpha.id,
          oldReleaseId: null,
          oldReleaseName: null,
          newReleaseId: ctx.release.id,
          newReleaseName: "Alpha 2.4",
        },
        {
          projectId: ctx.alpha.id,
          oldReleaseId: ctx.release.id,
          oldReleaseName: "Alpha 2.4",
          newReleaseId: null,
          newReleaseName: null,
        },
      ]),
    );

    mockAuthenticatedSession(ctx.betaOnly);
    const activities = await read();
    expect(releaseChanges(activities)).toEqual(
      expect.arrayContaining([
        {
          projectId: null,
          oldReleaseId: null,
          oldReleaseName: null,
          newReleaseId: ctx.release.id,
          newReleaseName: null,
        },
        {
          projectId: null,
          oldReleaseId: ctx.release.id,
          oldReleaseName: null,
          newReleaseId: null,
          newReleaseName: null,
        },
      ]),
    );
    expect(releaseChanges(activities)).toHaveLength(2);
    const body = JSON.stringify(activities);
    expect(body).not.toContain("Alpha 2.4");
    expect(body).not.toContain(ctx.alpha.id);
  });

  it("hides them from the workspace feed and from search", async () => {
    const ctx = await moveReleasedTaskToBeta();
    const search = (q: string) =>
      ctx.api(
        `/search?${new URLSearchParams({ q, workspaceId: ctx.workspace.id, type: "activities" })}`,
      );

    const ownerResults = (await (await search("Alpha 2.4")).json()) as {
      results: { content?: string }[];
    };
    expect(ownerResults.results.map((result) => result.content)).toEqual(
      expect.arrayContaining(['added the task to release "Alpha 2.4"']),
    );

    mockAuthenticatedSession(ctx.betaOnly);
    const feed = await ctx.api(`/activity/workspace/${ctx.workspace.id}`);
    expect(feed.status).toBe(200);
    const entries = (await feed.json()) as Activity[];
    expect(releaseChanges(entries)).toHaveLength(2);
    expect(JSON.stringify(entries)).not.toContain("Alpha 2.4");

    const hidden = await search("Alpha 2.4");
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toMatchObject({ results: [] });
  });
});
