import type { ImportedProject } from "@kaneo/importers";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { auth } from "../../apps/api/src/auth";
import { createApp } from "../../apps/api/src/index";
import { createImportProject } from "../../apps/api/src/import/writer/create-import-project";
import { writeProjectContent } from "../../apps/api/src/import/writer/write-project-content";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

const document = {
  version: 2,
  tasks: [
    { key: "f", title: "Feature", type: "feature", status: "to-do" },
    {
      key: "b",
      title: "Bug",
      type: "bug",
      status: "done",
      startDate: "2026-10-26T00:00:00.000Z",
      dueDate: "2026-11-03T00:00:00.000Z",
      featureKey: "f",
      milestoneKey: "m",
      labels: [{ name: "Regression", color: "red" }],
    },
    {
      key: "t",
      title: "Task",
      type: "task",
      status: "to-do",
      featureKey: "f",
      milestoneKey: null,
    },
  ],
  milestones: [
    {
      key: "m",
      featureKey: "f",
      title: "First ship",
      description: "Description",
      startDate: "2026-10-25",
      endDate: "2026-11-01",
      position: 0,
    },
  ],
};

async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const source = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const target = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const post = (id: string, body: unknown) =>
    app.request(`/api/task/import/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { ...member, source, target, app, post };
}

describe("milestone transfers", () => {
  it("round trips hierarchy, dates and labels with newly generated IDs", async () => {
    const ctx = await setup();
    expect((await ctx.post(ctx.source.project.id, document)).status).toBe(200);
    const exported = await (
      await ctx.app.request(`/api/task/export/${ctx.source.project.id}`)
    ).json();
    expect(exported).toMatchObject({
      version: 3,
      milestones: [
        { title: "First ship", startDate: "2026-10-26", endDate: "2026-11-03" },
      ],
    });
    const result = await ctx.post(ctx.target.project.id, exported);
    expect(result.status).toBe(200);
    const rows = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, ctx.target.project.id));
    const feature = rows.find((row) => row.title === "Feature")!;
    const bug = rows.find((row) => row.title === "Bug")!;
    const task = rows.find((row) => row.title === "Task")!;
    const [milestone] = await db
      .select()
      .from(schema.milestoneTable)
      .where(eq(schema.milestoneTable.featureId, feature.id));
    expect(bug).toMatchObject({
      type: "bug",
      featureId: feature.id,
      milestoneId: milestone!.id,
    });
    expect(task).toMatchObject({
      type: "task",
      featureId: feature.id,
      milestoneId: null,
    });
    expect(milestone).toMatchObject({
      description: "Description",
      legacyStartDate: null,
      legacyEndDate: null,
    });
    expect(
      exported.tasks.map((item: { key: string }) => item.key),
    ).not.toContain(feature.id);
    expect(
      await db
        .select()
        .from(schema.labelTable)
        .where(eq(schema.labelTable.taskId, bug.id)),
    ).toMatchObject([{ name: "Regression" }]);
  });

  it.each([{ endDate: undefined }, { endDate: null }])(
    "accepts but ignores former targetDate and manual date values: %j",
    async ({ endDate }) => {
      const ctx = await setup();
      const legacy = {
        ...document,
        milestones: [
          {
            ...document.milestones[0]!,
            startDate: null,
            targetDate: "2026-11-04",
            endDate,
          },
        ],
      };
      const imported = await ctx.post(ctx.source.project.id, legacy);
      expect(imported.status).toBe(200);
      const exported = await (
        await ctx.app.request(`/api/task/export/${ctx.source.project.id}`)
      ).json();
      expect(exported.milestones[0]).toMatchObject({
        startDate: "2026-10-26",
        endDate: "2026-11-03",
      });
      expect(exported.milestones[0]).not.toHaveProperty("targetDate");
    },
  );

  it.each([
    {
      ...document,
      milestones: [
        {
          ...document.milestones[0]!,
          startDate: "2026-11-02",
          endDate: "2026-11-01",
        },
      ],
    },
    { ...document, tasks: [...document.tasks, document.tasks[0]!] },
    {
      ...document,
      milestones: [{ ...document.milestones[0]!, featureKey: "b" }],
    },
    {
      ...document,
      tasks: [document.tasks[0]!, { ...document.tasks[1]!, featureKey: null }],
    },
    {
      ...document,
      tasks: [
        document.tasks[0]!,
        { ...document.tasks[1]!, userId: "no-member" },
      ],
    },
  ])("rejects malformed hierarchy atomically", async (payload) => {
    const ctx = await setup();
    expect((await ctx.post(ctx.target.project.id, payload)).status).toBe(400);
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, ctx.target.project.id)),
    ).toEqual([]);
  });

  it("keeps legacy per-task behavior and rejects silently dropping hierarchy", async () => {
    const ctx = await setup();
    expect(
      (
        await ctx.post(ctx.target.project.id, {
          tasks: [{ title: "Old", status: "to-do" }],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await ctx.post(ctx.target.project.id, {
          ...document,
          version: undefined,
        })
      ).status,
    ).toBe(400);
    const rows = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, ctx.target.project.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "task",
      featureId: null,
      milestoneId: null,
    });
  });

  it("requires update permission for hierarchy but keeps legacy create-only imports", async () => {
    const ctx = await createWorkspaceMember({ role: "importer" });
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "importer",
      permission: JSON.stringify({ task: ["create"] }),
    });
    const { project } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    mockAuthenticatedSession(ctx.user);
    const { app } = createApp();
    const post = (body: unknown) =>
      app.request(`/api/task/import/${project.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await post(document)).status).toBe(403);
    expect(
      (await post({ tasks: [{ title: "Legacy", status: "to-do" }] })).status,
    ).toBe(200);
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, project.id)),
    ).toHaveLength(1);
  });

  it("requires label permissions before creating definitions or attaching labels", async () => {
    const ctx = await createWorkspaceMember({ role: "importer" });
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspace.id,
      role: "importer",
      permission: JSON.stringify({ task: ["create"] }),
    });
    const { project } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    mockAuthenticatedSession(ctx.user);
    const { app } = createApp();
    const result = await app.request(`/api/task/import/${project.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 2,
        milestones: [],
        tasks: [
          {
            key: "t",
            title: "Restricted",
            status: "to-do",
            labels: [{ name: "New workspace label", color: "red" }],
          },
        ],
      }),
    });
    expect(result.status).toBe(403);
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, project.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(schema.labelTable)
        .where(eq(schema.labelTable.workspaceId, ctx.workspace.id)),
    ).toEqual([]);
  });

  it("enforces label API-key scopes before an atomic v2 import", async () => {
    const ctx = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const key = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Task import only",
        permissions: { task: ["create"] },
      },
    });
    const { app } = createApp();
    const result = await app.request(`/api/task/import/${project.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key.key },
      body: JSON.stringify({
        version: 2,
        milestones: [],
        tasks: [
          {
            key: "t",
            title: "Scoped",
            status: "to-do",
            labels: [{ name: "Scoped label", color: "blue" }],
          },
        ],
      }),
    });
    expect(result.status).toBe(403);
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, project.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(schema.labelTable)
        .where(eq(schema.labelTable.workspaceId, ctx.workspace.id)),
    ).toEqual([]);
  });

  it("rolls back earlier inserts and task numbering after a later database failure", async () => {
    const ctx = await setup();
    await db.execute(
      sql`CREATE FUNCTION fail_milestone_transfer_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title = 'Fail transfer' THEN RAISE EXCEPTION 'test import failure'; END IF; RETURN NEW; END $$`,
    );
    await db.execute(
      sql`CREATE TRIGGER fail_milestone_transfer_test BEFORE INSERT ON task FOR EACH ROW EXECUTE FUNCTION fail_milestone_transfer_test()`,
    );
    try {
      const failed = await ctx.post(ctx.target.project.id, {
        ...document,
        tasks: [
          ...document.tasks,
          { key: "fail", title: "Fail transfer", status: "to-do" },
        ],
      });
      expect(failed.status).toBe(500);
      expect(
        await db
          .select()
          .from(schema.taskTable)
          .where(eq(schema.taskTable.projectId, ctx.target.project.id)),
      ).toEqual([]);
      const [project] = await db
        .select()
        .from(schema.projectTable)
        .where(eq(schema.projectTable.id, ctx.target.project.id));
      expect(project?.lastTaskNumber).toBe(0);
    } finally {
      await db.execute(sql`DROP TRIGGER fail_milestone_transfer_test ON task`);
      await db.execute(sql`DROP FUNCTION fail_milestone_transfer_test()`);
    }
  });

  it("preserves connected Kaneo explicit Feature and milestone links", async () => {
    const ctx = await setup();
    const project: ImportedProject = {
      name: "Connected milestones",
      columns: [{ key: "todo", name: "To Do", isFinal: false }],
      labels: [],
      relations: [],
      warnings: [],
      tasks: [
        {
          key: "f",
          type: "feature",
          title: "Owner",
          columnKey: "todo",
          description: "",
          priority: "medium",
          labelKeys: [],
          comments: [],
        },
        {
          key: "b",
          type: "bug",
          title: "Member",
          columnKey: "todo",
          description: "",
          priority: "medium",
          labelKeys: [],
          comments: [],
          featureKey: "f",
          milestoneKey: "m",
        },
      ],
      milestones: [
        {
          key: "m",
          featureKey: "f",
          title: "First",
          startDate: "2026-10-25",
          endDate: "2026-11-02",
          position: 0,
        },
      ],
    };
    const id = await createImportProject(
      {
        workspaceId: ctx.workspace.id,
        name: project.name,
        userId: ctx.user.id,
      },
      async (tx, created) => {
        await writeProjectContent(tx, {
          projectId: created.id,
          workspaceId: ctx.workspace.id,
          userId: ctx.user.id,
          source: "kaneo",
          project,
          includeComments: false,
        });
        return created.id;
      },
    );
    const rows = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, id));
    const feature = rows.find((row) => row.type === "feature")!;
    const [milestone] = await db
      .select()
      .from(schema.milestoneTable)
      .where(eq(schema.milestoneTable.featureId, feature.id));
    expect(rows.find((row) => row.type === "bug")).toMatchObject({
      featureId: feature.id,
      milestoneId: milestone!.id,
    });
    expect(milestone).toMatchObject({
      legacyStartDate: null,
      legacyEndDate: null,
    });
  });
});
