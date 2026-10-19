import type { ImportedProject, ImportedTask } from "@kaneo/importers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createImportProject } from "../../apps/api/src/import/writer/create-import-project";
import { writeProjectContent } from "../../apps/api/src/import/writer/write-project-content";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

beforeEach(resetTestDatabase);

const task = (
  key: string,
  extra: Partial<ImportedTask> = {},
): ImportedTask => ({
  key,
  title: key,
  columnKey: "todo",
  description: "",
  priority: "medium",
  labelKeys: [],
  comments: [],
  ...extra,
});
const edge = (sourceKey: string, targetKey: string) => ({
  sourceKey,
  targetKey,
  type: "subtask" as const,
});
async function importProject(
  tasks: ImportedTask[],
  relations: ImportedProject["relations"],
  milestones: ImportedProject["milestones"] = [],
) {
  const context = await createWorkspaceMember({ role: "owner" });
  const project: ImportedProject = {
    name: "Imported precedence",
    columns: [{ key: "todo", name: "To Do", isFinal: false }],
    labels: [],
    tasks,
    relations,
    milestones,
    warnings: [],
  };
  const projectId = await createImportProject(
    {
      workspaceId: context.workspace.id,
      userId: context.user.id,
      name: project.name,
    },
    async (tx, created) => {
      await writeProjectContent(tx, {
        projectId: created.id,
        workspaceId: context.workspace.id,
        userId: context.user.id,
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
  const links = await db.select().from(schema.taskRelationTable);
  return { projectId, byTitle, links };
}

describe("connected milestone import membership precedence", () => {
  it("preserves explicit nulls and Bug classification, retaining conflicting legacy edges as Related", async () => {
    const result = await importProject(
      [
        task("parent", { type: "bug", featureKey: null, milestoneKey: null }),
        task("child", { type: "task", featureKey: null, milestoneKey: null }),
      ],
      [edge("parent", "child")],
    );
    expect(result.byTitle.get("parent")).toMatchObject({
      type: "bug",
      featureId: null,
      milestoneId: null,
    });
    expect(result.byTitle.get("child")).toMatchObject({
      type: "task",
      featureId: null,
      milestoneId: null,
    });
    expect(result.links).toMatchObject([
      {
        sourceTaskId: result.byTitle.get("parent")!.id,
        targetTaskId: result.byTitle.get("child")!.id,
        relationType: "related",
      },
    ]);
  });
  it("retains explicit Feature/milestone links over another legacy parent and drops matching synthetic edges", async () => {
    const result = await importProject(
      [
        task("feature", { type: "feature", featureKey: null }),
        task("parent", { type: "bug", featureKey: null }),
        task("child", {
          type: "bug",
          featureKey: "feature",
          milestoneKey: "m",
        }),
      ],
      [edge("parent", "child"), edge("feature", "child")],
      [{ key: "m", featureKey: "feature", title: "Ship", position: 0 }],
    );
    const owner = result.byTitle.get("feature")!;
    const [milestone] = await db
      .select()
      .from(schema.milestoneTable)
      .where(eq(schema.milestoneTable.featureId, owner.id));
    expect(result.byTitle.get("parent")).toMatchObject({
      type: "bug",
      featureId: null,
    });
    expect(result.byTitle.get("child")).toMatchObject({
      type: "bug",
      featureId: owner.id,
      milestoneId: milestone!.id,
    });
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({
      sourceTaskId: result.byTitle.get("parent")!.id,
      targetTaskId: result.byTitle.get("child")!.id,
      relationType: "related",
    });
  });
  it("keeps legacy promotion and tree flattening when older sources omit membership fields", async () => {
    const result = await importProject(
      [task("parent"), task("child"), task("grandchild", { type: "bug" })],
      [edge("parent", "child"), edge("child", "grandchild")],
    );
    const owner = result.byTitle.get("parent")!;
    expect(owner).toMatchObject({ type: "feature", featureId: null });
    expect(result.byTitle.get("child")).toMatchObject({
      type: "task",
      featureId: owner.id,
    });
    expect(result.byTitle.get("grandchild")).toMatchObject({
      type: "bug",
      featureId: owner.id,
    });
    expect(result.links).toMatchObject([
      {
        sourceTaskId: result.byTitle.get("child")!.id,
        targetTaskId: result.byTitle.get("grandchild")!.id,
        relationType: "related",
      },
    ]);
  });
  it("flattens omitted descendants under an explicit member's Feature without promoting the member", async () => {
    const result = await importProject(
      [
        task("feature", { type: "feature" }),
        task("parent", { type: "bug", featureKey: "feature" }),
        task("child"),
      ],
      [edge("parent", "child")],
    );
    const owner = result.byTitle.get("feature")!;
    expect(result.byTitle.get("parent")).toMatchObject({
      type: "bug",
      featureId: owner.id,
    });
    expect(result.byTitle.get("child")).toMatchObject({
      type: "task",
      featureId: owner.id,
    });
    expect(result.links).toMatchObject([
      {
        sourceTaskId: result.byTitle.get("parent")!.id,
        targetTaskId: result.byTitle.get("child")!.id,
        relationType: "related",
      },
    ]);
  });
});
