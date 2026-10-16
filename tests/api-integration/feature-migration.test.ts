import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { migrateFeatureHierarchy } from "../../apps/api/src/migrations/feature-hierarchy";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const undoSql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../apps/api/src/migrations/feature-hierarchy-undo.sql",
  ),
  "utf8",
);

beforeEach(resetTestDatabase);

const LONG_AGO = new Date("2025-01-01T00:00:00.000Z");
let numbers = 0;

async function addTask(projectId: string, title: string) {
  numbers += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title,
      number: numbers,
      updatedAt: LONG_AGO,
    })
    .returning();
  return task;
}

let minute = 0;
async function link(
  sourceTaskId: string,
  targetTaskId: string,
  relationType = "subtask",
) {
  minute += 1;
  const [relation] = await db
    .insert(schema.taskRelationTable)
    .values({
      sourceTaskId,
      targetTaskId,
      relationType,
      createdAt: new Date(LONG_AGO.getTime() + minute * 60_000),
    })
    .returning();
  return relation;
}

async function hierarchy(ids: string[]) {
  const rows = await db
    .select({
      id: schema.taskTable.id,
      type: schema.taskTable.type,
      featureId: schema.taskTable.featureId,
      updatedAt: schema.taskTable.updatedAt,
    })
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

async function relationRows() {
  return db
    .select({
      id: schema.taskRelationTable.id,
      sourceTaskId: schema.taskRelationTable.sourceTaskId,
      targetTaskId: schema.taskRelationTable.targetTaskId,
      relationType: schema.taskRelationTable.relationType,
    })
    .from(schema.taskRelationTable);
}

type Link = { id: string; sourceTaskId: string; targetTaskId: string };

// Relation rows as id -> "source>target".
const asLinks = (rows: Link[]) =>
  Object.fromEntries(
    rows.map((row) => [row.id, `${row.sourceTaskId}>${row.targetTaskId}`]),
  );

async function subtaskLinks() {
  return asLinks(
    (await relationRows()).filter((row) => row.relationType === "subtask"),
  );
}

async function expectPlainTasks(ids: string[]) {
  for (const task of (await hierarchy(ids)).values()) {
    expect({ type: task.type, featureId: task.featureId }).toEqual({
      type: "task",
      featureId: null,
    });
  }
}

// Unordered related pairs, each once per row.
async function relatedPairs() {
  return (await relationRows())
    .filter((row) => row.relationType === "related")
    .map((row) => [row.sourceTaskId, row.targetTaskId].sort().join("<>"))
    .sort();
}

const pair = (left: string, right: string) => [left, right].sort().join("<>");

async function setFeature(taskId: string, featureId: string | null) {
  await db
    .update(schema.taskTable)
    .set({ featureId })
    .where(eq(schema.taskTable.id, taskId));
}

// What an older server does when it moves a task: only the project changes.
async function moveTask(taskId: string, projectId: string) {
  numbers += 1;
  await db
    .update(schema.taskTable)
    .set({ projectId, number: numbers })
    .where(eq(schema.taskTable.id, taskId));
}

async function seedLegacyData() {
  const { workspace } = await createWorkspaceMember();
  const { project } = await createProjectFixture({ workspaceId: workspace.id });
  const { project: sibling } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  const other = await createWorkspaceMember();
  const { project: foreign } = await createProjectFixture({
    workspaceId: other.workspace.id,
  });

  const t = {
    epic: await addTask(project.id, "Epic"),
    story: await addTask(project.id, "Story"),
    sub: await addTask(project.id, "Sub-task"),
    p1: await addTask(project.id, "First parent"),
    p2: await addTask(project.id, "Second parent"),
    shared: await addTask(project.id, "Two parents"),
    cycleA: await addTask(project.id, "Cycle A"),
    cycleB: await addTask(project.id, "Cycle B"),
    cycleC: await addTask(project.id, "Cycle C"),
    lonely: await addTask(project.id, "Untouched"),
    elsewhere: await addTask(sibling.id, "In a sibling project"),
    foreign: await addTask(foreign.id, "In another workspace"),
  };
  const r = {
    epicStory: await link(t.epic.id, t.story.id),
    storySub: await link(t.story.id, t.sub.id),
    duplicate: await link(t.epic.id, t.story.id),
    p1Shared: await link(t.p1.id, t.shared.id),
    p2Shared: await link(t.p2.id, t.shared.id),
    cycleAB: await link(t.cycleA.id, t.cycleB.id),
    cycleBC: await link(t.cycleB.id, t.cycleC.id),
    cycleCA: await link(t.cycleC.id, t.cycleA.id),
    reversed: await link(t.story.id, t.epic.id),
    crossProject: await link(t.epic.id, t.elsewhere.id),
    crossWorkspace: await link(t.epic.id, t.foreign.id),
    blocks: await link(t.lonely.id, t.epic.id, "blocks"),
  };
  return { project, sibling, t, r };
}

describe("converting subtasks into features", () => {
  it("turns each tree into a feature and keeps every other link", async () => {
    const { t, r } = await seedLegacyData();

    await migrateFeatureHierarchy();

    const tasks = await hierarchy(Object.values(t).map((task) => task.id));
    const shape = (id: string) => {
      const task = tasks.get(id);
      return { type: task?.type, featureId: task?.featureId };
    };
    expect(shape(t.epic.id)).toEqual({ type: "feature", featureId: null });
    // Deeper levels flatten into the top feature.
    expect(shape(t.story.id)).toEqual({ type: "task", featureId: t.epic.id });
    expect(shape(t.sub.id)).toEqual({ type: "task", featureId: t.epic.id });
    // The oldest of several parents wins; the other stays a task.
    expect(shape(t.p1.id)).toEqual({ type: "feature", featureId: null });
    expect(shape(t.shared.id)).toEqual({ type: "task", featureId: t.p1.id });
    expect(shape(t.p2.id)).toEqual({ type: "task", featureId: null });
    // A loop has no top task, so no feature.
    for (const id of [t.cycleA.id, t.cycleB.id, t.cycleC.id]) {
      expect(shape(id)).toEqual({ type: "task", featureId: null });
    }
    expect(shape(t.lonely.id)).toEqual({ type: "task", featureId: null });
    // The conversion isn't an edit: calendars keep their LAST-MODIFIED.
    for (const task of tasks.values()) {
      expect(task.updatedAt).toEqual(LONG_AGO);
    }

    const relations = new Map(
      (await relationRows()).map((row) => [row.id, row.relationType]),
    );
    expect(Object.fromEntries(relations)).toEqual({
      [r.storySub.id]: "related",
      [r.p2Shared.id]: "related",
      [r.cycleAB.id]: "related",
      [r.cycleBC.id]: "related",
      [r.cycleCA.id]: "related",
      [r.crossProject.id]: "related",
      [r.crossWorkspace.id]: "related",
      [r.blocks.id]: "blocks",
    });

    const backup = await db.select().from(schema.legacySubtaskRelationTable);
    expect(
      Object.fromEntries(backup.map((row) => [row.id, row.outcome])),
    ).toEqual({
      [r.epicStory.id]: "membership",
      [r.storySub.id]: "related",
      [r.duplicate.id]: "dropped",
      [r.p1Shared.id]: "membership",
      [r.p2Shared.id]: "related",
      [r.cycleAB.id]: "related",
      [r.cycleBC.id]: "related",
      [r.cycleCA.id]: "related",
      [r.reversed.id]: "dropped",
      [r.crossProject.id]: "related",
      [r.crossWorkspace.id]: "related",
    });
  });

  it("picks up what an older server wrote after the first run", async () => {
    const { project, sibling, t } = await seedLegacyData();
    await migrateFeatureHierarchy();

    // During a rolling update an older server still makes subtasks (here of
    // a task that's now in a feature) and moves tasks between projects.
    const late = await addTask(project.id, "Made by an old server");
    await link(t.story.id, late.id);
    await link(t.epic.id, t.lonely.id);
    await moveTask(t.sub.id, sibling.id);

    await migrateFeatureHierarchy();
    // Runs again cleanly when there's nothing left to do.
    await migrateFeatureHierarchy();

    const tasks = await hierarchy([late.id, t.lonely.id, t.sub.id]);
    expect(tasks.get(late.id)?.featureId).toBe(t.epic.id);
    expect(tasks.get(t.lonely.id)?.featureId).toBe(t.epic.id);
    // Moved out of its feature's project, so out of the feature.
    expect(tasks.get(t.sub.id)?.featureId).toBeNull();
    const [{ subtasks }] = await db
      .select({ subtasks: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.taskRelationTable)
      .where(eq(schema.taskRelationTable.relationType, "subtask"));
    expect(subtasks).toBe(0);
  });

  it("can be undone with the undo script", async () => {
    const { project, t, r } = await seedLegacyData();
    await migrateFeatureHierarchy();
    // Made with features after the upgrade.
    await setFeature(t.lonely.id, t.epic.id);
    const before = await addTask(project.id, "Unrelated");

    await db.execute(sql.raw(undoSql));

    await expectPlainTasks([
      ...Object.values(t).map((task) => task.id),
      before.id,
    ]);
    // Exactly the old links: the sub-task the conversion flattened into the
    // epic is still under it through the story, so it gets no second parent.
    expect(await subtaskLinks()).toEqual({
      ...asLinks([
        r.epicStory,
        r.storySub,
        r.duplicate,
        r.p1Shared,
        r.p2Shared,
        r.cycleAB,
        r.cycleBC,
        r.cycleCA,
        r.reversed,
        r.crossProject,
        r.crossWorkspace,
      ]),
      [`feature-undo-${t.epic.id}-${t.lonely.id}`]: `${t.epic.id}>${t.lonely.id}`,
    });
    expect(await db.select().from(schema.legacySubtaskRelationTable)).toEqual(
      [],
    );
  });

  it("can be undone again after a second upgrade", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const add = (title: string) => addTask(project.id, title);
    const t = {
      p: await add("Parent"),
      c: await add("Child"),
      q: await add("Grandparent added later"),
      a: await add("Parent whose link goes"),
      b: await add("Child whose link goes"),
      f1: await add("First feature"),
      y1: await add("First feature's task"),
      f2: await add("Second feature"),
      y2: await add("Second feature's task"),
      m: await add("Moves between features"),
    };
    const pc = await link(t.p.id, t.c.id);
    const ab = await link(t.a.id, t.b.id);
    const f1y1 = await link(t.f1.id, t.y1.id);
    const f2y2 = await link(t.f2.id, t.y2.id);

    await migrateFeatureHierarchy();
    await setFeature(t.m.id, t.f1.id);
    await db.execute(sql.raw(undoSql));

    // Back on the older version: one link goes, and the parent gets a parent,
    // so the next upgrade keeps the old link as a related one instead.
    await db
      .delete(schema.taskRelationTable)
      .where(eq(schema.taskRelationTable.id, ab.id));
    const qp = await link(t.q.id, t.p.id);

    await migrateFeatureHierarchy();
    const backup = await db.select().from(schema.legacySubtaskRelationTable);
    expect(
      Object.fromEntries(backup.map((row) => [row.id, row.outcome])),
    ).toEqual({
      [pc.id]: "related",
      [qp.id]: "membership",
      [f1y1.id]: "membership",
      [f2y2.id]: "membership",
      [`feature-undo-${t.f1.id}-${t.m.id}`]: "membership",
    });
    await setFeature(t.m.id, t.f2.id);
    await db.execute(sql.raw(undoSql));

    expect(await subtaskLinks()).toEqual({
      ...asLinks([pc, qp, f1y1, f2y2]),
      // The old parent comes back, and the new feature becomes one too.
      [`feature-undo-${t.f1.id}-${t.m.id}`]: `${t.f1.id}>${t.m.id}`,
      [`feature-undo-${t.f2.id}-${t.m.id}`]: `${t.f2.id}>${t.m.id}`,
    });
    expect(await relatedPairs()).toEqual([]);
    await expectPlainTasks(Object.values(t).map((task) => task.id));
  });

  it("refreshes a backup row an earlier conversion left behind", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const parent = await addTask(project.id, "Parent");
    const child = await addTask(project.id, "Child");
    const edge = await link(parent.id, child.id);
    // As an undo that kept its backup would leave it.
    await db.insert(schema.legacySubtaskRelationTable).values({
      ...edge,
      outcome: "related",
      convertedAt: LONG_AGO,
    });

    await migrateFeatureHierarchy();

    const [row] = await db
      .select()
      .from(schema.legacySubtaskRelationTable)
      .where(eq(schema.legacySubtaskRelationTable.id, edge.id));
    expect(row.outcome).toBe("membership");
    expect(row.convertedAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
  });

  it("clears a stale feature link before converting the task's new parent", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const { project: other } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const feature = await addTask(project.id, "Feature");
    const task = await addTask(project.id, "Moved by an old server");
    await link(feature.id, task.id);
    await migrateFeatureHierarchy();

    // An older server moves the task, keeping its feature link, then makes
    // it a subtask in its new project.
    await moveTask(task.id, other.id);
    const parent = await addTask(other.id, "New parent");
    await link(parent.id, task.id);

    await migrateFeatureHierarchy();

    const tasks = await hierarchy([feature.id, task.id, parent.id]);
    expect(tasks.get(parent.id)).toMatchObject({ type: "feature" });
    expect(tasks.get(task.id)).toMatchObject({
      type: "task",
      featureId: parent.id,
    });
    expect(await subtaskLinks()).toEqual({});
    expect(await relatedPairs()).toEqual([pair(feature.id, task.id)]);
  });

  it("keeps a related link for each feature link it clears", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const { project: other } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const feature = await addTask(project.id, "Feature");
    const first = await addTask(project.id, "First task");
    const second = await addTask(project.id, "Already related");
    await link(feature.id, first.id);
    await link(feature.id, second.id);
    await migrateFeatureHierarchy();
    await link(second.id, feature.id, "related");

    // An older server moves the feature without its tasks.
    await moveTask(feature.id, other.id);
    await migrateFeatureHierarchy();

    const tasks = await hierarchy([first.id, second.id]);
    for (const task of tasks.values()) {
      expect(task.featureId).toBeNull();
      expect(task.updatedAt).toEqual(LONG_AGO);
    }
    expect(await relatedPairs()).toEqual(
      [pair(feature.id, first.id), pair(feature.id, second.id)].sort(),
    );
  });

  it("keeps a feature link an older server fixes while it's checked", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const { project: other } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const feature = await addTask(project.id, "Feature");
    const task = await addTask(project.id, "Moved away and back");
    await link(feature.id, task.id);
    await migrateFeatureHierarchy();
    await moveTask(task.id, other.id);

    // An older server moves the task back, and commits only once the repair
    // has read the stale link and waits for the task's row.
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markMoved = () => {};
    const moved = new Promise<void>((resolve) => {
      markMoved = resolve;
    });
    numbers += 1;
    const moveBack = db.transaction(async (tx) => {
      await tx
        .update(schema.taskTable)
        .set({ projectId: project.id, number: numbers })
        .where(eq(schema.taskTable.id, task.id));
      markMoved();
      await released;
    });
    try {
      await moved;
      const migration = migrateFeatureHierarchy();
      await waitForRepairToBlock();
      release();
      await Promise.all([moveBack, migration]);
    } finally {
      release();
    }

    const tasks = await hierarchy([task.id]);
    expect(tasks.get(task.id)?.featureId).toBe(feature.id);
    expect(await relatedPairs()).toEqual([]);
  });
});

async function waitForRepairToBlock() {
  for (let attempt = 0; attempt < 400; attempt++) {
    const result = await db.execute<{ waiting: number }>(sql`
      SELECT count(*)::int AS waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND query LIKE '%feature-repair-%'
    `);
    if (result.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The repair never waited for the task's row.");
}
