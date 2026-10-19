import type { ImportedProject } from "@kaneo/importers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createImportProject } from "../../apps/api/src/import/writer/create-import-project";
import { writeProjectContent } from "../../apps/api/src/import/writer/write-project-content";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

describe("Bug transfers", () => {
  it("round trips explicit native types and defaults older records to Task", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const source = await createProjectFixture({ workspaceId: workspace.id });
    const target = await createProjectFixture({ workspaceId: workspace.id });
    mockAuthenticatedSession(user);
    const { app } = createApp();
    const post = (projectId: string, tasks: unknown[]) =>
      app.request(`/api/task/import/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      });
    const items = [
      { title: "Bug", type: "bug", status: "to-do" },
      { title: "Feature", type: "feature", status: "done" },
      { title: "Legacy", status: "to-do" },
    ];
    expect((await post(source.project.id, items)).status).toBe(200);
    const exported = await app.request(`/api/task/export/${source.project.id}`);
    expect(exported.status).toBe(200);
    const document = (await exported.json()) as {
      tasks: Array<{ title: string; type: string }>;
    };
    expect(
      document.tasks
        .map(({ title, type }) => ({ title, type }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    ).toEqual([
      { title: "Bug", type: "bug" },
      { title: "Feature", type: "feature" },
      { title: "Legacy", type: "task" },
    ]);
    expect((await post(target.project.id, document.tasks)).status).toBe(200);
    const imported = await db
      .select({ title: schema.taskTable.title, type: schema.taskTable.type })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, target.project.id));
    expect(imported.sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      { title: "Bug", type: "bug" },
      { title: "Feature", type: "feature" },
      { title: "Legacy", type: "task" },
    ]);
    expect(
      (
        await post(target.project.id, [
          { title: "Invalid", type: "epic", status: "to-do" },
        ])
      ).status,
    ).toBe(400);
  });

  it("preserves native Feature and Bug classifications through connected import hierarchy planning", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const project: ImportedProject = {
      name: "Native types",
      columns: [{ key: "todo", name: "To Do", isFinal: false }],
      labels: [],
      warnings: [],
      tasks: (
        [
          ["feature", "feature"],
          ["bug", "bug"],
          ["standalone", "bug"],
          ["legacy", undefined],
        ] as const
      ).map(([key, type]) => ({
        key,
        ...(type ? { type } : {}),
        title: key,
        columnKey: "todo",
        description: "",
        priority: "medium",
        labelKeys: [],
        comments: [],
      })),
      relations: [{ sourceKey: "feature", targetKey: "bug", type: "subtask" }],
    };
    const projectId = await createImportProject(
      { workspaceId: workspace.id, name: project.name, userId: user.id },
      async (tx, created) => {
        await writeProjectContent(tx, {
          projectId: created.id,
          workspaceId: workspace.id,
          userId: user.id,
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
      .where(eq(schema.taskTable.projectId, projectId));
    const byTitle = new Map(rows.map((row) => [row.title, row]));
    expect(byTitle.get("feature")).toMatchObject({
      type: "feature",
      featureId: null,
    });
    expect(byTitle.get("bug")).toMatchObject({
      type: "bug",
      featureId: byTitle.get("feature")?.id,
    });
    expect(byTitle.get("standalone")).toMatchObject({
      type: "bug",
      featureId: null,
    });
    expect(byTitle.get("legacy")).toMatchObject({
      type: "task",
      featureId: null,
    });
  });
});
