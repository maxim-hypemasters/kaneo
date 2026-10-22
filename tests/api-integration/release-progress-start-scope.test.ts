import { and, asc, eq, isNull } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import db from "../../apps/api/src/database";
import {
  projectWorkflowHistoryTable,
  releaseProgressEventTable,
  releaseTable,
  taskTable,
} from "../../apps/api/src/database/schema";
import { createApp } from "../../apps/api/src/index";
import { readReleaseProgress } from "../../apps/api/src/release/progress/read-release-progress";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);
afterEach(() => vi.useRealTimers());

async function setup(startDate = "2026-10-02") {
  const member = await createWorkspaceMember({ role: "viewer" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const release = await insertRelease(fixture.project.id, {
    startDate,
    codeFreezeDate: startDate,
    submissionDate: startDate,
  });
  await db
    .update(projectWorkflowHistoryTable)
    .set({ recordedAt: new Date("2025-01-01T00:00:00Z") })
    .where(eq(projectWorkflowHistoryTable.projectId, fixture.project.id));
  return { ...member, ...fixture, release };
}

async function ledger(
  releaseId: string,
  trackedFrom: string,
  changes: { at: string; status?: string; delta: number }[] = [],
) {
  await db
    .delete(releaseProgressEventTable)
    .where(eq(releaseProgressEventTable.releaseId, releaseId));
  await db.insert(releaseProgressEventTable).values([
    { releaseId, recordedAt: new Date(trackedFrom), status: null, delta: 0 },
    ...changes.map(({ at, status = "to-do", delta }) => ({
      releaseId,
      recordedAt: new Date(at),
      status,
      delta,
    })),
  ]);
}

function nowAt(instant = "2026-10-05T12:00:00Z") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instant));
}

describe("release scope at the start boundary", () => {
  it("returns pre-midnight scope separately from the first end-of-day point", async () => {
    const { release, project, user } = await setup();
    const other = await insertRelease(project.id);
    await ledger(other.id, "2026-09-30T00:00:00Z", [
      { at: "2026-10-01T12:00:00Z", delta: 9 },
    ]);
    await ledger(release.id, "2026-09-30T00:00:00Z", [
      { at: "2026-10-01T23:59:59.999Z", delta: 2 },
      { at: "2026-10-02T00:00:00Z", delta: 1 },
      { at: "2026-10-02T12:00:00Z", delta: 1 },
    ]);
    nowAt();

    const result = await readReleaseProgress(release.id, "UTC");
    expect(result.startScope).toBe(2);
    expect(result.current).toEqual({ scope: 4, started: 0, completed: 0 });
    expect(result.points).toEqual([
      { date: "2026-10-02", scope: 4, started: 0, completed: 0 },
    ]);
    mockAuthenticatedSession(user);
    const response = await createApp().app.request(
      `/api/release/${release.id}/progress?timeZone=UTC`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it("keeps Task/Bug status, conversion and archive changes neutral while membership changes remain net", async () => {
    const { project, release } = await setup();
    const other = await insertRelease(project.id);
    const task = await insertTask(project.id, { releaseId: release.id });
    const bug = await insertTask(project.id, {
      releaseId: release.id,
      type: "bug",
    });
    await db
      .update(taskTable)
      .set({ status: "done" })
      .where(eq(taskTable.id, task.id));
    await db
      .update(taskTable)
      .set({ status: "archived" })
      .where(eq(taskTable.id, bug.id));
    await db
      .update(taskTable)
      .set({ type: "bug" })
      .where(eq(taskTable.id, task.id));
    const before = await db
      .select()
      .from(releaseProgressEventTable)
      .where(eq(releaseProgressEventTable.releaseId, release.id));
    await db
      .update(releaseProgressEventTable)
      .set({ recordedAt: new Date("2026-10-01T12:00:00Z") })
      .where(eq(releaseProgressEventTable.releaseId, release.id));

    await insertTask(project.id, { releaseId: release.id });
    await db.delete(taskTable).where(eq(taskTable.id, bug.id));
    await db
      .update(taskTable)
      .set({ releaseId: other.id })
      .where(eq(taskTable.id, task.id));
    const events = await db
      .select()
      .from(releaseProgressEventTable)
      .where(eq(releaseProgressEventTable.releaseId, release.id))
      .orderBy(asc(releaseProgressEventTable.id));
    for (const event of events.slice(before.length)) {
      await db
        .update(releaseProgressEventTable)
        .set({ recordedAt: new Date("2026-10-03T12:00:00Z") })
        .where(eq(releaseProgressEventTable.id, event.id));
    }
    nowAt();
    const result = await readReleaseProgress(release.id, "UTC");
    expect(result.startScope).toBe(2);
    expect(result.current.scope).toBe(1);
    expect(result.points.map(({ date, scope }) => ({ date, scope }))).toEqual([
      { date: "2026-10-02", scope: 2 },
      { date: "2026-10-03", scope: 1 },
    ]);
  });

  it.each([
    ["2026-10-01T23:59:59.999Z", 0],
    ["2026-10-02T00:00:00Z", null],
    ["2026-10-02T00:00:00.001Z", null],
    ["2026-10-03T00:00:00Z", null],
  ] as const)(
    "requires tracking strictly before midnight (%s)",
    async (trackedFrom, expected) => {
      const { release } = await setup();
      await ledger(release.id, trackedFrom);
      nowAt();
      const result = await readReleaseProgress(release.id, "UTC");
      expect(result.startScope).toBe(expected);
      expect(result.current.scope).toBe(0);
    },
  );

  it("returns null before the release starts even with complete pre-start history", async () => {
    const { release } = await setup();
    await ledger(release.id, "2026-09-30T00:00:00Z", [
      { at: "2026-10-01T12:00:00Z", delta: 2 },
    ]);
    nowAt("2026-10-01T23:59:59Z");
    const result = await readReleaseProgress(release.id, "UTC");
    expect(result.startScope).toBeNull();
    expect(result.current.scope).toBe(2);
    expect(result.points).toEqual([]);
  });

  it("uses the requested timezone for both scope and tracking coverage", async () => {
    const { release } = await setup();
    await ledger(release.id, "2026-10-01T20:00:00Z", [
      { at: "2026-10-01T23:30:00Z", delta: 1 },
    ]);
    nowAt();
    expect((await readReleaseProgress(release.id, "UTC")).startScope).toBe(1);
    expect(
      (await readReleaseProgress(release.id, "Europe/Belgrade")).startScope,
    ).toBe(0);
    await db
      .update(releaseProgressEventTable)
      .set({ recordedAt: new Date("2026-10-01T22:30:00Z") })
      .where(
        and(
          eq(releaseProgressEventTable.releaseId, release.id),
          isNull(releaseProgressEventTable.status),
        ),
      );
    expect((await readReleaseProgress(release.id, "UTC")).startScope).toBe(1);
    expect(
      (await readReleaseProgress(release.id, "Europe/Belgrade")).startScope,
    ).toBeNull();
  });

  it.each([
    ["2026-03-09", "2026-03-09T04:00:00Z", "America/New_York"],
    ["2026-11-02", "2026-11-02T05:00:00Z", "America/New_York"],
    ["2026-10-26", "2026-10-25T23:00:00Z", "Europe/Belgrade"],
    ["2026-07-01", "2026-07-01T07:00:00Z", "PST"],
  ])(
    "uses local midnight across DST and canonical aliases (%s, %s)",
    async (startDate, boundary, timeZone) => {
      const { release } = await setup(startDate);
      const boundaryMs = new Date(boundary).getTime();
      await ledger(
        release.id,
        new Date(boundaryMs - 86_400_000).toISOString(),
        [
          { at: new Date(boundaryMs - 1).toISOString(), delta: 2 },
          { at: boundary, delta: 1 },
        ],
      );
      nowAt(new Date(boundaryMs + 86_400_000).toISOString());
      const result = await readReleaseProgress(release.id, timeZone);
      expect(result.startScope).toBe(2);
      expect(result.current.scope).toBe(3);
    },
  );

  it("recalculates from the edited start date without modifying the ledger", async () => {
    const { release } = await setup();
    await ledger(release.id, "2026-09-30T00:00:00Z", [
      { at: "2026-10-01T12:00:00Z", delta: 1 },
      { at: "2026-10-02T12:00:00Z", delta: 1 },
    ]);
    nowAt();
    const before = await db.select().from(releaseProgressEventTable);
    expect((await readReleaseProgress(release.id, "UTC")).startScope).toBe(1);
    await db
      .update(releaseTable)
      .set({ startDate: "2026-10-01" })
      .where(eq(releaseTable.id, release.id));
    expect((await readReleaseProgress(release.id, "UTC")).startScope).toBe(0);
    await db
      .update(releaseTable)
      .set({ startDate: "2026-09-29" })
      .where(eq(releaseTable.id, release.id));
    expect(
      (await readReleaseProgress(release.id, "UTC")).startScope,
    ).toBeNull();
    expect(await db.select().from(releaseProgressEventTable)).toEqual(before);
  });
});
