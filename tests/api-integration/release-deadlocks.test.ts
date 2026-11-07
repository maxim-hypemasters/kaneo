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

// While set, a milestone's release change waits this long after locking the
// milestone before it locks the Tasks following it, so the other request is
// the first to wait on it and the one PostgreSQL aborts.
const pause = vi.hoisted(() => ({ ms: 0 }));
const afterPause = () =>
  new Promise((resolve) => {
    setTimeout(resolve, pause.ms);
  });
vi.mock("../../apps/api/src/milestone/planning", async (original) => {
  const actual =
    await original<typeof import("../../apps/api/src/milestone/planning")>();
  return {
    ...actual,
    moveMilestoneFollowers: async (
      ...args: Parameters<typeof actual.moveMilestoneFollowers>
    ) => {
      await afterPause();
      return actual.moveMilestoneFollowers(...args);
    },
  };
});

beforeEach(async () => {
  await resetTestDatabase();
  failures.seen = [];
  pause.ms = 0;
});

const deadlocksIn = (file: string) =>
  failures.seen.filter(
    (failure) => failure.code === "40P01" && failure.caller.includes(file),
  ).length;

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

// A Feature's milestone in a release, with a Task following it there.
async function milestoneWithFollower(
  projectId: string,
  releaseId: string | null,
) {
  const feature = await insertTask(projectId, { type: "feature" });
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({ featureId: feature.id, title: "Checkpoint", releaseId })
    .returning();
  if (!milestone) throw new Error("Failed to insert milestone");
  const follower = await insertTask(projectId, {
    featureId: feature.id,
    milestoneId: milestone.id,
    releaseId,
  });
  return { feature, milestone, follower };
}

// Holds a row FOR UPDATE until the returned function runs, so the requests
// that need it queue behind it in the order a test starts them.
async function holdRow(
  table: typeof schema.taskTable | typeof schema.milestoneTable,
  id: string,
) {
  let locked!: () => void;
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const done = db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${table.id} from ${table} where ${table.id} = ${id} for update`,
    );
    locked();
    await gate;
  });
  await Promise.race([ready, done]);
  return async () => {
    finish();
    await done;
  };
}

// Waits until this many statements wait on locks. PostgreSQL checks a
// waiter for a deadlock once, a second after it starts waiting, so the
// tests release the held row well within that. It doesn't match the query
// text: pg_stat_activity cuts long queries off before their FOR UPDATE.
async function waitForLockWaits(count: number) {
  await vi.waitFor(
    async () => {
      const result = await db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock'`,
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

async function milestoneReleaseOf(id: string) {
  const [row] = await db
    .select({ releaseId: schema.milestoneTable.releaseId })
    .from(schema.milestoneTable)
    .where(eq(schema.milestoneTable.id, id));
  return row?.releaseId;
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

// A Feature's milestone updates as their release [from, to], oldest first.
async function milestoneReleaseHistory(featureId: string) {
  const rows = await db
    .select({ eventData: schema.activityTable.eventData })
    .from(schema.activityTable)
    .where(
      and(
        eq(schema.activityTable.taskId, featureId),
        eq(schema.activityTable.type, "milestone_updated"),
      ),
    )
    .orderBy(asc(schema.activityTable.createdAt));
  return rows.map((row) => {
    const { changes } = row.eventData as {
      changes: { releaseId?: { from: string | null; to: string | null } };
    };
    return [changes.releaseId?.from, changes.releaseId?.to];
  });
}

describe("lock-order cycles", () => {
  it("finishes both a milestone's release change and deleting its release", async () => {
    const ctx = await setup();
    const { feature, milestone, follower } = await milestoneWithFollower(
      ctx.project.id,
      ctx.r24.id,
    );
    const release = await holdRow(schema.milestoneTable, milestone.id);
    pause.ms = 100;

    // The release change locks the feature and queues on the milestone. The
    // delete locks the follower and queues behind it. Once the milestone is
    // free the delete waits on it and, a moment later, the release change
    // on the follower.
    const [changed, deleted] = await interleave(
      release,
      () =>
        ctx.request("PATCH", `/milestone/${milestone.id}`, {
          releaseId: ctx.r25.id,
        }),
      () => ctx.request("DELETE", `/release/${ctx.r24.id}`),
    );

    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      id: milestone.id,
      releaseId: ctx.r25.id,
    });
    expect(deleted.status).toBe(200);
    expect(deadlocksIn("delete-release")).toBe(1);
    expect(await releaseExists(ctx.r24.id)).toBe(false);
    expect(await milestoneReleaseOf(milestone.id)).toBe(ctx.r25.id);
    expect(await releasesOf([follower.id])).toEqual({
      [follower.id]: ctx.r25.id,
    });
    // The delete ran again after the release change, with nothing left in
    // the release; the aborted attempt's activity rolled back with it.
    expect(await releaseHistory(follower.id)).toEqual([
      [ctx.r24.id, ctx.r25.id],
    ]);
    expect(await milestoneReleaseHistory(feature.id)).toEqual([
      [ctx.r24.id, ctx.r25.id],
    ]);
  });

  it("finishes both a milestone's release change and moving its release's unfinished items", async () => {
    const ctx = await setup();
    const { feature, milestone, follower } = await milestoneWithFollower(
      ctx.project.id,
      ctx.r24.id,
    );
    const release = await holdRow(schema.milestoneTable, milestone.id);
    pause.ms = 100;

    // As with deleting the release: moving its items locks the follower,
    // then waits on the milestone first.
    const [changed, moved] = await interleave(
      release,
      () =>
        ctx.request("PATCH", `/milestone/${milestone.id}`, {
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
    expect(await moved.json()).toEqual({
      movedTaskIds: [],
      movedMilestoneIds: [],
    });
    expect(await milestoneReleaseOf(milestone.id)).toBe(ctx.r25.id);
    expect(await releasesOf([follower.id])).toEqual({
      [follower.id]: ctx.r25.id,
    });
    expect(await releaseHistory(follower.id)).toEqual([
      [ctx.r24.id, ctx.r25.id],
    ]);
    expect(await milestoneReleaseHistory(feature.id)).toEqual([
      [ctx.r24.id, ctx.r25.id],
    ]);
  });

  it("finishes both a milestone's release change and a reorder of its follower without a deadlock", async () => {
    const ctx = await setup();
    const { milestone, follower } = await milestoneWithFollower(
      ctx.project.id,
      null,
    );
    const other = await insertTask(ctx.project.id);
    const release = await holdRow(schema.taskTable, follower.id);

    // The release change holds the feature and milestone and queues on the
    // follower. A reorder locks the project row FOR UPDATE before any task,
    // which the release change holds FOR KEY SHARE, and never locks Features
    // or milestones, so it queues behind the release change instead of
    // closing a cycle.
    const [changed, reordered] = await interleave(
      release,
      () =>
        ctx.request("PATCH", `/milestone/${milestone.id}`, {
          releaseId: ctx.r24.id,
        }),
      () =>
        ctx.request("POST", "/task/reorder", {
          projectId: ctx.project.id,
          tasks: [
            { id: follower.id, position: 1 },
            { id: other.id, position: 0 },
          ],
        }),
    );

    expect(changed.status).toBe(200);
    expect(reordered.status).toBe(200);
    expect(deadlocksIn("write-milestones") + deadlocksIn("reorder-tasks")).toBe(
      0,
    );
    expect(await milestoneReleaseOf(milestone.id)).toBe(ctx.r24.id);
    expect(await releasesOf([follower.id, other.id])).toEqual({
      [follower.id]: ctx.r24.id,
      [other.id]: null,
    });
    const positions = await db
      .select({ id: schema.taskTable.id, position: schema.taskTable.position })
      .from(schema.taskTable)
      .where(inArray(schema.taskTable.id, [follower.id, other.id]));
    expect(
      Object.fromEntries(positions.map((t) => [t.id, t.position])),
    ).toEqual({ [follower.id]: 1, [other.id]: 0 });
  });

  it("finishes both joining a feature and deleting the joining task's release without a deadlock", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });
    const release = await holdRow(schema.taskTable, task.id);

    // Joining locks the task, then the feature FOR SHARE. A Feature is never
    // in a release, so the delete locks only the task and queues behind the
    // join instead of holding the feature.
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
    expect(
      deadlocksIn("with-locked-task") + deadlocksIn("delete-release"),
    ).toBe(0);
    expect(await releaseExists(ctx.r24.id)).toBe(false);
    const [row] = await db
      .select({
        featureId: schema.taskTable.featureId,
        releaseId: schema.taskTable.releaseId,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(row).toEqual({ featureId: feature.id, releaseId: null });
    // The join kept the task's release; the delete then took it out.
    expect(await releaseHistory(task.id)).toEqual([[ctx.r24.id, null]]);
  });
});
