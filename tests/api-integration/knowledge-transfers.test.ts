import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import exportTasks from "../../apps/api/src/task/controllers/export-tasks";
import { importHierarchy } from "../../apps/api/src/task/transfers/import-hierarchy";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

async function context() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  return { ...member, project, columns };
}

describe("knowledge and planning transfers", () => {
  it("round trips planning, releases, archived Feature identity and snapshots with new portable IDs", async () => {
    const source = await context();
    const document = {
      releases: [
        {
          key: "r",
          name: "Delivery",
          startDate: "2026-10-01",
          codeFreezeDate: "2026-10-15",
          submissionDate: "2026-10-20",
        },
      ],
      tasks: [
        {
          key: "f",
          title: "Knowledge",
          type: "feature" as const,
          status: null,
          archivedAt: "2026-10-01T00:00:00.000Z",
          planningSnapshots: [
            {
              status: "in-review",
              priority: "high",
              releaseId: "r",
              releaseName: "Delivery",
            },
          ],
        },
        {
          key: "b",
          title: "Bug",
          type: "bug" as const,
          status: "done",
          featureKey: "f",
          milestoneKey: "m",
          releaseKey: "r",
        },
      ],
      milestones: [
        {
          key: "m",
          featureKey: "f",
          title: "Implementation",
          position: 4,
          status: "in-progress",
          priority: "urgent",
          leadId: source.user.id,
          releaseKey: "r",
          startDate: "2026-10-02",
          endDate: "2026-10-14",
        },
      ],
    };
    await importHierarchy(
      source.project.id,
      document,
      source.user.id,
      source.workspace.id,
    );
    const exported = await exportTasks(source.project.id, source.user.id);
    expect(exported.version).toBe(3);
    expect(
      exported.tasks.find((task) => task.type === "feature"),
    ).toMatchObject({
      status: null,
      priority: null,
      archivedAt: "2026-10-01T00:00:00.000Z",
      planningSnapshots: [
        expect.objectContaining({
          status: "in-review",
          releaseName: "Delivery",
        }),
      ],
    });
    expect(exported.milestones[0]).toMatchObject({
      leadId: source.user.id,
      status: "in-progress",
      priority: "urgent",
      position: 4,
      startDate: "2026-10-02",
      endDate: "2026-10-14",
    });
    const target = await createProjectFixture({
      workspaceId: source.workspace.id,
    });
    await importHierarchy(
      target.project.id,
      exported,
      source.user.id,
      source.workspace.id,
    );
    const copied = await exportTasks(target.project.id, source.user.id);
    expect(copied.tasks.map((task) => task.key)).not.toEqual(
      exported.tasks.map((task) => task.key),
    );
    const feature = copied.tasks.find((task) => task.type === "feature")!;
    const bug = copied.tasks.find((task) => task.type === "bug")!;
    expect(bug.featureKey).toBe(feature.key);
    expect(bug.milestoneKey).toBe(copied.milestones[0].key);
    expect(bug.releaseKey).toBe(copied.releases[0].key);
    expect(copied.milestones[0].releaseKey).toBe(bug.releaseKey);
    expect(copied.milestones[0].leadId).toBe(source.user.id);
    expect(feature.planningSnapshots).toEqual([
      expect.objectContaining({
        releaseId: copied.releases[0].key,
        releaseName: "Delivery",
      }),
    ]);
  });

  it("keeps legacy Feature planning as history without recreating execution fields", async () => {
    const ctx = await context();
    await importHierarchy(
      ctx.project.id,
      {
        tasks: [
          {
            key: "legacy",
            type: "feature",
            title: "Legacy",
            status: "done",
            priority: "high",
            startDate: "2026-10-01",
            userId: ctx.user.id,
          },
        ],
        milestones: [],
      },
      ctx.user.id,
    );
    const [feature] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, ctx.project.id));
    expect(feature).toMatchObject({
      type: "feature",
      status: null,
      priority: null,
      userId: null,
      startDate: null,
    });
    const history = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.taskId, feature.id));
    expect(history).toEqual([
      expect.objectContaining({
        type: "feature_planning_snapshot",
        eventData: expect.objectContaining({
          status: "done",
          priority: "high",
          userId: ctx.user.id,
          projectId: ctx.project.id,
        }),
      }),
    ]);
  });

  it("rejects unknown portable releases atomically", async () => {
    const ctx = await context();
    await expect(
      importHierarchy(ctx.project.id, {
        tasks: [
          { key: "f", title: "Feature", type: "feature", status: null },
          {
            key: "t",
            title: "Task",
            status: "to-do",
            featureKey: "f",
            releaseKey: "missing",
          },
        ],
      }),
    ).rejects.toThrow("Release references");
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, ctx.project.id)),
    ).toHaveLength(0);
  });
});

describe("connected Kaneo planning transfers", () => {
  it("preserves archive/history and planning while mapping releases and people", async () => {
    const ctx = await context();
    const { writeImportedProject } =
      await import("../../apps/api/src/import/write-imported-project");
    const written = await writeImportedProject({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      source: "kaneo",
      includeComments: false,
      project: {
        name: "Connected planning",
        columns: [{ key: "doing", name: "Doing", isFinal: false }],
        labels: [],
        relations: [],
        warnings: [],
        releases: [
          {
            key: "r",
            name: "Launch",
            startDate: "2026-10-01",
            codeFreezeDate: "2026-10-15",
            submissionDate: "2026-10-20",
          },
        ],
        tasks: [
          {
            key: "f",
            type: "feature",
            title: "Archive",
            columnKey: null,
            description: "Keep documentation",
            priority: "no-priority",
            archivedAt: "2026-10-01T00:00:00.000Z",
            planningSnapshots: [
              {
                status: "done",
                priority: "high",
                releaseId: "r",
                releaseName: "Launch",
              },
            ],
            labelKeys: [],
            comments: [],
          },
          {
            key: "b",
            type: "bug",
            title: "Work",
            columnKey: "doing",
            description: "",
            priority: "medium",
            featureKey: "f",
            milestoneKey: "m",
            releaseKey: "r",
            labelKeys: [],
            comments: [],
          },
        ],
        milestones: [
          {
            key: "m",
            featureKey: "f",
            title: "Delivery",
            position: 3,
            status: "doing",
            priority: "urgent",
            lead: { email: ctx.user.email },
            releaseKey: "r",
            startDate: "2026-10-02",
            endDate: "2026-10-14",
          },
        ],
      },
    });
    const exported = await exportTasks(written.projectId, ctx.user.id);
    const feature = exported.tasks.find((task) => task.type === "feature")!;
    expect(feature).toMatchObject({
      status: null,
      priority: null,
      archivedAt: "2026-10-01T00:00:00.000Z",
      description: "Keep documentation",
    });
    expect(feature.planningSnapshots).toHaveLength(1);
    expect(feature.planningSnapshots[0]).toMatchObject({
      status: "done",
      priority: "high",
      releaseId: exported.releases[0].key,
    });
    expect(exported.milestones[0]).toMatchObject({
      leadId: ctx.user.id,
      status: "doing",
      priority: "urgent",
      releaseKey: exported.releases[0].key,
      position: 3,
    });
    expect(exported.tasks.find((task) => task.type === "bug")).toMatchObject({
      featureKey: feature.key,
      milestoneKey: exported.milestones[0].key,
      releaseKey: exported.releases[0].key,
    });
  });

  it("rolls back a connected project with dangling release metadata", async () => {
    const ctx = await context();
    const { writeImportedProject } =
      await import("../../apps/api/src/import/write-imported-project");
    await expect(
      writeImportedProject({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        source: "kaneo",
        includeComments: false,
        project: {
          name: "Invalid connected",
          columns: [],
          labels: [],
          relations: [],
          warnings: [],
          tasks: [
            {
              key: "t",
              title: "Work",
              columnKey: null,
              description: "",
              priority: "low",
              releaseKey: "missing",
              labelKeys: [],
              comments: [],
            },
          ],
        },
      }),
    ).rejects.toThrow("Unknown imported release reference");
    expect(
      await db
        .select()
        .from(schema.projectTable)
        .where(eq(schema.projectTable.name, "Invalid connected")),
    ).toHaveLength(0);
  });
});
