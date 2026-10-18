import { asc, eq } from "drizzle-orm";
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
  columnTable,
  projectWorkflowHistoryTable,
  releaseProgressEventTable,
  releaseTable,
  taskTable,
} from "../../apps/api/src/database/schema";
import { createApp } from "../../apps/api/src/index";
import { readReleaseProgress } from "../../apps/api/src/release/progress/read-release-progress";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);
afterEach(() => vi.useRealTimers());

async function setup() {
  const member = await createWorkspaceMember({ role: "viewer" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const release = await insertRelease(fixture.project.id);
  mockAuthenticatedSession(member.user);
  return { ...member, ...fixture, release, app: createApp().app };
}

function progressPath(id: string, timeZone?: string) {
  return `/api/release/${id}/progress${timeZone === undefined ? "" : `?timeZone=${encodeURIComponent(timeZone)}`}`;
}

async function setRecordedDates(releaseId: string, dates: string[]) {
  const events = await db
    .select()
    .from(releaseProgressEventTable)
    .where(eq(releaseProgressEventTable.releaseId, releaseId))
    .orderBy(asc(releaseProgressEventTable.id));
  expect(events).toHaveLength(dates.length);
  for (const [index, event] of events.entries()) {
    await db
      .update(releaseProgressEventTable)
      .set({ recordedAt: new Date(dates[index]!) })
      .where(eq(releaseProgressEventTable.id, event.id));
  }
}

async function setWorkflowDates(projectId: string, dates: string[]) {
  const history = await db
    .select()
    .from(projectWorkflowHistoryTable)
    .where(eq(projectWorkflowHistoryTable.projectId, projectId))
    .orderBy(asc(projectWorkflowHistoryTable.id));
  expect(history).toHaveLength(dates.length);
  for (const [index, entry] of history.entries()) {
    await db
      .update(projectWorkflowHistoryTable)
      .set({ recordedAt: new Date(dates[index]!) })
      .where(eq(projectWorkflowHistoryTable.id, entry.id));
  }
}

function nowAt(instant: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instant));
}

describe("release progress API", () => {
  it("lets a viewer read history and defaults its calendar to UTC", async () => {
    const { release, app } = await setup();
    const response = await app.request(progressPath(release.id));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      today: new Date().toISOString().slice(0, 10),
      current: { scope: 0, started: 0, completed: 0 },
    });
    const explicit = await app.request(progressPath(release.id, "UTC"));
    expect(await explicit.json()).toEqual(result);
  });

  it("rejects anonymous callers and hides other workspaces", async () => {
    const { release, app } = await setup();
    mockAnonymousSession();
    expect((await app.request(progressPath(release.id))).status).toBe(401);
    const other = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(other.user);
    expect((await app.request(progressPath(release.id))).status).toBe(404);
  });

  it("enforces project restrictions before reading history", async () => {
    const ctx = await createRestrictedWorkspace();
    const visible = await insertRelease(ctx.alpha.id);
    const hidden = await insertRelease(ctx.beta.id);
    mockAuthenticatedSession(ctx.restricted);
    const { app } = createApp();
    expect((await app.request(progressPath(visible.id))).status).toBe(200);
    expect((await app.request(progressPath(hidden.id))).status).toBe(403);
  });

  it.each(["Mars/Olympus", "", "UTC; select 1"])(
    "rejects invalid timezone %j",
    async (timeZone) => {
      const { release, app } = await setup();
      expect(
        (await app.request(progressPath(release.id, timeZone))).status,
      ).toBe(400);
    },
  );

  it("matches release task counts while keeping archived tasks in scope and features out", async () => {
    const { project, release, app } = await setup();
    for (const status of [
      "to-do",
      "in-progress",
      "done",
      "archived",
      "planned",
    ]) {
      await insertTask(project.id, { releaseId: release.id, status });
    }
    await insertTask(project.id, {
      releaseId: release.id,
      type: "feature",
      status: "done",
    });
    await insertTask(project.id, { status: "done" });
    const response = await app.request(progressPath(release.id));
    expect(response.status).toBe(200);
    const history = await response.json();
    const summary = await (
      await app.request(`/api/release/${release.id}`)
    ).json();
    expect(history.current).toEqual({ scope: 5, started: 2, completed: 1 });
    expect(history.current.scope).toBe(summary.progress.tasks.total);
    expect(history.current.completed).toBe(summary.progress.tasks.completed);
  });

  it("reads stable historical status and workflow transitions through the SQL reader", async () => {
    const { project, release, columns, app } = await setup();
    const task = await insertTask(project.id, { releaseId: release.id });
    await insertTask(project.id, {
      releaseId: release.id,
      status: "in-review",
    });
    await insertTask(project.id, { releaseId: release.id, status: "archived" });
    await db
      .update(taskTable)
      .set({ status: "in-progress" })
      .where(eq(taskTable.id, task.id));
    await db
      .update(taskTable)
      .set({ status: "done" })
      .where(eq(taskTable.id, task.id));
    await db
      .update(columnTable)
      .set({ isFinal: true })
      .where(eq(columnTable.id, columns.inReview.id));
    await db
      .update(columnTable)
      .set({ isFinal: false, position: -1 })
      .where(eq(columnTable.id, columns.inReview.id));
    await setRecordedDates(release.id, [
      "2026-10-01T00:00:00Z",
      "2026-10-01T09:00:00Z",
      "2026-10-01T09:00:00Z",
      "2026-10-01T09:00:00Z",
      "2026-10-02T09:00:00Z",
      "2026-10-02T09:00:00Z",
      "2026-10-03T09:00:00Z",
      "2026-10-03T09:00:00Z",
    ]);
    await setWorkflowDates(project.id, [
      ...Array<string>(4).fill("2026-10-01T00:00:00Z"),
      "2026-10-04T09:00:00Z",
      "2026-10-05T09:00:00Z",
    ]);
    nowAt("2026-10-05T12:00:00Z");
    const result = await readReleaseProgress(release.id, "UTC");
    expect(result.trackedFrom).toBe("2026-10-01T00:00:00.000Z");
    expect(result.points).toEqual([
      { date: "2026-10-01", scope: 3, started: 1, completed: 0 },
      { date: "2026-10-02", scope: 3, started: 2, completed: 0 },
      { date: "2026-10-03", scope: 3, started: 2, completed: 1 },
      { date: "2026-10-04", scope: 3, started: 2, completed: 2 },
      { date: "2026-10-05", scope: 3, started: 1, completed: 1 },
    ]);
    const response = await app.request(progressPath(release.id));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it("buckets near-midnight events by the requested timezone", async () => {
    const { project, release, app } = await setup();
    const task = await insertTask(project.id, { releaseId: release.id });
    await db
      .update(taskTable)
      .set({ status: "done" })
      .where(eq(taskTable.id, task.id));
    await setRecordedDates(release.id, [
      "2026-10-01T12:00:00Z",
      "2026-10-01T23:30:00Z",
      "2026-10-02T00:30:00Z",
      "2026-10-02T00:30:00Z",
    ]);
    await setWorkflowDates(
      project.id,
      Array<string>(4).fill("2026-10-01T00:00:00Z"),
    );
    nowAt("2026-10-02T12:00:00Z");
    const utcResponse = await app.request(progressPath(release.id, "UTC"));
    const belgradeResponse = await app.request(
      progressPath(release.id, "Europe/Belgrade"),
    );
    expect(utcResponse.status).toBe(200);
    expect(belgradeResponse.status).toBe(200);
    const utc = await utcResponse.json();
    const belgrade = await belgradeResponse.json();
    expect(utc.points).toEqual([
      { date: "2026-10-01", scope: 1, started: 0, completed: 0 },
      { date: "2026-10-02", scope: 1, started: 1, completed: 1 },
    ]);
    expect(belgrade.points).toEqual([
      { date: "2026-10-01", scope: 0, started: 0, completed: 0 },
      { date: "2026-10-02", scope: 1, started: 1, completed: 1 },
    ]);
    expect(belgrade.current).toEqual(utc.current);
  });

  it("canonicalizes timezone aliases before PostgreSQL buckets summer events", async () => {
    const { project, release, app } = await setup();
    await db
      .update(releaseTable)
      .set({
        startDate: "2026-06-30",
        codeFreezeDate: "2026-07-10",
        submissionDate: "2026-07-20",
      })
      .where(eq(releaseTable.id, release.id));
    await insertTask(project.id, { releaseId: release.id });
    await setRecordedDates(release.id, [
      "2026-06-30T12:00:00Z",
      "2026-07-01T07:30:00Z",
    ]);
    await setWorkflowDates(
      project.id,
      Array<string>(4).fill("2026-06-30T12:00:00Z"),
    );
    nowAt("2026-07-01T08:30:00Z");
    const aliasResponse = await app.request(progressPath(release.id, "PST"));
    const canonicalResponse = await app.request(
      progressPath(release.id, "America/Los_Angeles"),
    );
    expect(aliasResponse.status).toBe(200);
    expect(canonicalResponse.status).toBe(200);
    const alias = await aliasResponse.json();
    expect(alias).toEqual(await canonicalResponse.json());
    expect(alias.today).toBe("2026-07-01");
    expect(alias.points).toEqual([
      { date: "2026-06-30", scope: 0, started: 0, completed: 0 },
      { date: "2026-07-01", scope: 1, started: 0, completed: 0 },
    ]);
  });
});
