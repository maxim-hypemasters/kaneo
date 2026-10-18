import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
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

// Each attempt the retry helper saw fail: its SQLSTATE and who retried it.
const failures = vi.hoisted(() => ({
  seen: [] as { code: string | undefined; caller: string }[],
}));
vi.mock("../../apps/api/src/utils/retry-transaction", async (original) => {
  const actual =
    await original<
      typeof import("../../apps/api/src/utils/retry-transaction")
    >();
  const { pgErrorCode } =
    await import("../../apps/api/src/utils/pg-error-code");
  return {
    retryTransaction: <T>(
      run: () => Promise<T>,
      isRetryable?: (error: unknown) => boolean,
    ) => {
      const caller = new Error().stack ?? "";
      return actual.retryTransaction(
        () =>
          run().catch((error: unknown) => {
            failures.seen.push({ code: pgErrorCode(error), caller });
            throw error;
          }),
        isRetryable,
      );
    },
  };
});

// While set, a release change or a join waits this long after locking its
// task before going on, so the other request is the first to wait on it and
// the one PostgreSQL aborts.
const pause = vi.hoisted(() => ({ ms: 0 }));
const afterPause = () =>
  new Promise((resolve) => {
    setTimeout(resolve, pause.ms);
  });
vi.mock(
  "../../apps/api/src/release/membership/assign-release",
  async (original) => {
    const actual =
      await original<
        typeof import("../../apps/api/src/release/membership/assign-release")
      >();
    return {
      ...actual,
      setTaskRelease: async (
        ...args: Parameters<typeof actual.setTaskRelease>
      ) => {
        await afterPause();
        return actual.setTaskRelease(...args);
      },
    };
  },
);
vi.mock(
  "../../apps/api/src/task/feature-hierarchy/assign-feature",
  async (original) => {
    const actual =
      await original<
        typeof import("../../apps/api/src/task/feature-hierarchy/assign-feature")
      >();
    return {
      ...actual,
      setTaskFeature: async (
        ...args: Parameters<typeof actual.setTaskFeature>
      ) => {
        await afterPause();
        return actual.setTaskFeature(...args);
      },
    };
  },
);

beforeEach(async () => {
  await resetTestDatabase();
  failures.seen = [];
  pause.ms = 0;
});

const deadlocksIn = (file: string) =>
  failures.seen.filter(
    (failure) => failure.code === "40P01" && failure.caller.includes(file),
  ).length;

// Ids sort by their first letter, so a test knows which row each path
// reaches first when it locks rows ordered by id.
const idStarting = (letter: string) =>
  `${letter}${randomUUID().replaceAll("-", "")}`;

async function setup() {
  const owner = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: owner.workspace.id,
  });
  const r24 = await insertRelease(project.id, { name: "2.4" });
  const r25 = await insertRelease(project.id, { name: "2.5" });
  mockAuthenticatedSession(owner.user);
  const { app } = createApp();
  const request = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  return { project, r24, r25, request };
}

// Holds a task row FOR UPDATE until the returned function runs, so the
// requests that need it queue behind it in the order a test starts them.
async function holdTask(id: string) {
  let locked!: () => void;
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const done = db.transaction(async (tx) => {
    await tx
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, id))
      .for("update");
    locked();
    await gate;
  });
  await Promise.race([ready, done]);
  return async () => {
    finish();
    await done;
  };
}

// Waits until this many statements wait on row locks. PostgreSQL checks a
// waiter for a deadlock once, a second after it starts waiting, so the
// tests release the held row well within that.
async function waitForLockWaits(count: number) {
  await vi.waitFor(
    async () => {
      const result = await db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock'
              and (query ilike '%for update%' or query ilike '%for share%')`,
      );
      expect(result.rows[0]?.waiting).toBeGreaterThanOrEqual(count);
    },
    { timeout: 5_000, interval: 5 },
  );
}

// Starts each request once the ones before it wait on a lock, then lets the
// held row go so they run into each other.
async function interleave(
  release: () => Promise<void>,
  ...requests: (() => Promise<Response>)[]
) {
  const started: Promise<Response>[] = [];
  try {
    for (const send of requests) {
      started.push(send());
      await waitForLockWaits(started.length);
    }
  } finally {
    await release();
  }
  return Promise.all(started);
}

async function releasesOf(ids: string[]) {
  const rows = await db
    .select({ id: schema.taskTable.id, releaseId: schema.taskTable.releaseId })
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, ids));
  return Object.fromEntries(rows.map((row) => [row.id, row.releaseId]));
}

async function releaseExists(id: string) {
  const release = await db.query.releaseTable.findFirst({
    where: eq(schema.releaseTable.id, id),
  });
  return release !== undefined;
}

// The release changes in a task's activity as [from, to], oldest first.
async function releaseHistory(taskId: string) {
  const rows = await db
    .select({ eventData: schema.activityTable.eventData })
    .from(schema.activityTable)
    .where(
      and(
        eq(schema.activityTable.taskId, taskId),
        eq(schema.activityTable.type, "release_changed"),
      ),
    )
    .orderBy(asc(schema.activityTable.createdAt));
  return rows.map((row) => {
    const data = row.eventData as {
      oldReleaseId: string | null;
      newReleaseId: string | null;
    };
    return [data.oldReleaseId, data.newReleaseId];
  });
}

describe("lock-order cycles", () => {
  it("finishes both a feature's release change and a reorder that deadlock", async () => {
    const ctx = await setup();
    // The reorder locks follower, other, feature by id; the release change
    // locks the feature, then its follower.
    const feature = await insertTask(ctx.project.id, {
      id: idStarting("z"),
      type: "feature",
    });
    const follower = await insertTask(ctx.project.id, {
      id: idStarting("a"),
      featureId: feature.id,
    });
    const other = await insertTask(ctx.project.id, { id: idStarting("m") });
    const release = await holdTask(other.id);

    // The reorder holds the follower and waits on other; the release change
    // holds the feature and waits on the follower. Once other is free the
    // reorder waits on the feature too, and the release change, waiting
    // longest, is the one PostgreSQL aborts.
    const [reordered, changed] = await interleave(
      release,
      () =>
        ctx.request("POST", "/task/reorder", {
          projectId: ctx.project.id,
          tasks: [
            { id: follower.id, position: 2 },
            { id: other.id, position: 1 },
            { id: feature.id, position: 0 },
          ],
        }),
      () =>
        ctx.request("PUT", `/task/release/${feature.id}`, {
          releaseId: ctx.r24.id,
        }),
    );

    expect(reordered.status).toBe(200);
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      id: feature.id,
      releaseId: ctx.r24.id,
      movedTaskIds: [follower.id],
    });
    // Both paths retry, and PostgreSQL may abort either one.
    expect(deadlocksIn("with-locked-task") + deadlocksIn("reorder-tasks")).toBe(
      1,
    );
    expect(await releasesOf([feature.id, follower.id])).toEqual({
      [feature.id]: ctx.r24.id,
      [follower.id]: ctx.r24.id,
    });
    // The aborted attempt's activity rolled back with it.
    for (const id of [feature.id, follower.id]) {
      expect(await releaseHistory(id)).toEqual([[null, ctx.r24.id]]);
    }
    const positions = await db
      .select({ id: schema.taskTable.id, position: schema.taskTable.position })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, ctx.project.id));
    expect(
      Object.fromEntries(positions.map((t) => [t.id, t.position])),
    ).toEqual({ [follower.id]: 2, [other.id]: 1, [feature.id]: 0 });
  });

  it("finishes both when the reorder waits longest in the deadlock", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      id: idStarting("z"),
      type: "feature",
    });
    const first = await insertTask(ctx.project.id, {
      id: idStarting("a"),
      featureId: feature.id,
      position: 5,
    });
    const second = await insertTask(ctx.project.id, {
      id: idStarting("c"),
      featureId: feature.id,
      position: 6,
    });
    const release = await holdTask(first.id);

    // The release change holds the feature and waits on its first follower;
    // the reorder holds the second follower and waits on the feature. Once
    // the first is free the release change waits on the second, and the
    // reorder, waiting longest, is usually the one PostgreSQL aborts.
    const [changed, reordered] = await interleave(
      release,
      () =>
        ctx.request("PUT", `/task/release/${feature.id}`, {
          releaseId: ctx.r24.id,
        }),
      () =>
        ctx.request("POST", "/task/reorder", {
          projectId: ctx.project.id,
          tasks: [
            { id: second.id, position: 0 },
            { id: feature.id, position: 1 },
          ],
        }),
    );

    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      movedTaskIds: [first.id, second.id],
    });
    expect(reordered.status).toBe(200);
    expect(deadlocksIn("with-locked-task") + deadlocksIn("reorder-tasks")).toBe(
      1,
    );
    const [moved] = await db
      .select({ position: schema.taskTable.position })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, second.id));
    expect(moved?.position).toBe(0);
  });

  it("finishes both a feature's release change and deleting its release", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      id: idStarting("z"),
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const follower = await insertTask(ctx.project.id, {
      id: idStarting("a"),
      featureId: feature.id,
      releaseId: ctx.r24.id,
    });
    const release = await holdTask(feature.id);
    pause.ms = 100;

    // The release change queues on the feature. The delete locks the
    // follower and queues behind it. Once the feature is free the delete
    // waits on the feature and, a moment later, the release change on the
    // follower.
    const [changed, deleted] = await interleave(
      release,
      () =>
        ctx.request("PUT", `/task/release/${feature.id}`, {
          releaseId: ctx.r25.id,
        }),
      () => ctx.request("DELETE", `/release/${ctx.r24.id}`),
    );

    expect(changed.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(deadlocksIn("delete-release")).toBe(1);
    expect(await releaseExists(ctx.r24.id)).toBe(false);
    expect(await releasesOf([feature.id, follower.id])).toEqual({
      [feature.id]: ctx.r25.id,
      [follower.id]: ctx.r25.id,
    });
    // The delete ran again after the release change, with no members left.
    for (const id of [feature.id, follower.id]) {
      expect(await releaseHistory(id)).toEqual([[ctx.r24.id, ctx.r25.id]]);
    }
  });

  it("finishes both joining a feature and deleting the release both are in", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      id: idStarting("a"),
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const task = await insertTask(ctx.project.id, {
      id: idStarting("z"),
      releaseId: ctx.r24.id,
    });
    const release = await holdTask(task.id);
    pause.ms = 100;

    // Joining queues on the task. The delete locks the feature and queues
    // behind it. Once the task is free the delete waits on the task and, a
    // moment later, joining waits on the feature FOR SHARE.
    const [joined, deleted] = await interleave(
      release,
      () =>
        ctx.request("PUT", `/task/feature/${task.id}`, {
          featureId: feature.id,
        }),
      () => ctx.request("DELETE", `/release/${ctx.r24.id}`),
    );

    expect(joined.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(deadlocksIn("delete-release")).toBe(1);
    expect(await releaseExists(ctx.r24.id)).toBe(false);
    const [row] = await db
      .select({
        featureId: schema.taskTable.featureId,
        releaseId: schema.taskTable.releaseId,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(row).toEqual({ featureId: feature.id, releaseId: null });
    expect((await releasesOf([feature.id]))[feature.id]).toBeNull();
  });

  it("finishes both a feature's release change and moving its release's unfinished items", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      id: idStarting("z"),
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const follower = await insertTask(ctx.project.id, {
      id: idStarting("a"),
      featureId: feature.id,
      releaseId: ctx.r24.id,
    });
    const release = await holdTask(feature.id);
    pause.ms = 100;

    // As with deleting the release: moving its items locks the follower,
    // then waits on the feature first.
    const [changed, moved] = await interleave(
      release,
      () =>
        ctx.request("PUT", `/task/release/${feature.id}`, {
          releaseId: ctx.r25.id,
        }),
      () =>
        ctx.request("POST", `/release/${ctx.r24.id}/move-unfinished`, {
          targetReleaseId: null,
        }),
    );

    expect(changed.status).toBe(200);
    expect(moved.status).toBe(200);
    expect(deadlocksIn("move-unfinished-items")).toBe(1);
    // It ran again after the release change and found nothing left to move.
    expect(await moved.json()).toEqual({ movedTaskIds: [] });
    expect(await releasesOf([feature.id, follower.id])).toEqual({
      [feature.id]: ctx.r25.id,
      [follower.id]: ctx.r25.id,
    });
    for (const id of [feature.id, follower.id]) {
      expect(await releaseHistory(id)).toEqual([[ctx.r24.id, ctx.r25.id]]);
    }
  });
});
