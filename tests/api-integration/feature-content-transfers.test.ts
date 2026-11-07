import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import exportTasks from "../../apps/api/src/task/controllers/export-tasks";
import {
  importHierarchy,
  type HierarchyTransfer,
} from "../../apps/api/src/task/transfers/import-hierarchy";
import { resetTestDatabase } from "./helpers/database";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

const dates = {
  createdAt: "2026-11-01T09:00:00.000Z",
  updatedAt: "2026-11-02T10:00:00.000Z",
};
const author = {
  name: "Original author",
  avatar: "https://example.com/avatar.png",
};
const content: HierarchyTransfer = {
  tasks: [{ key: "feature", type: "feature", title: "Knowledge" }],
  milestones: [
    {
      key: "milestone",
      featureKey: "feature",
      title: "Renamed milestone",
      position: 0,
    },
  ],
  featureDocuments: [
    {
      key: "document",
      featureKey: "feature",
      title: "Design",
      body: "# Original design\n\n[Asset](/api/task/assets/original)",
      revision: 4,
      ...dates,
      createdBy: author,
      updatedBy: { name: "Reviewer" },
    },
  ],
  featureUpdates: [
    {
      key: "report",
      featureKey: "feature",
      note: "Original update",
      health: "at-risk",
      ...dates,
      author,
      milestones: [
        {
          key: "milestone",
          title: "Original milestone title",
          position: 0,
          total: 3,
          started: 2,
          completed: 1,
          previousTotal: 2,
          previousCompleted: 0,
        },
        {
          key: "removed",
          title: "Deleted milestone",
          position: 1,
          total: 1,
          started: 1,
          completed: 1,
          previousTotal: null,
          previousCompleted: null,
        },
      ],
    },
  ],
};

async function context() {
  const member = await createWorkspaceMember({ role: "owner" });
  const project = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  return { ...member, ...project };
}

describe("native v5 Feature content transfers", () => {
  it("round trips Markdown, revisions, original authors and immutable snapshots with remapped identities", async () => {
    const source = await context();
    await importHierarchy(source.project.id, content, source.user.id);
    const exported = await exportTasks(source.project.id, source.user.id);
    expect(exported.version).toBe(5);
    expect(exported.featureDocuments[0]).toMatchObject({
      ...content.featureDocuments![0],
      key: expect.any(String),
      featureKey: exported.tasks[0]!.key,
      createdBy: { name: author.name },
      updatedBy: { name: "Reviewer" },
    });
    expect(exported.featureUpdates[0]).toMatchObject({
      ...content.featureUpdates![0],
      key: expect.any(String),
      featureKey: exported.tasks[0]!.key,
      milestones: [
        expect.objectContaining({
          ...content.featureUpdates![0]!.milestones[0],
          key: exported.milestones[0]!.key,
        }),
        expect.objectContaining({
          title: "Deleted milestone",
          key: expect.any(String),
        }),
      ],
    });
    const destination = await createProjectFixture({
      workspaceId: source.workspace.id,
    });
    await importHierarchy(destination.project.id, exported, source.user.id);
    const repeated = await exportTasks(destination.project.id, source.user.id);
    expect(repeated.featureDocuments[0]).toMatchObject({
      title: "Design",
      revision: 4,
      body: content.featureDocuments![0]!.body,
      ...dates,
      createdBy: { name: author.name },
    });
    expect(repeated.featureDocuments[0]!.featureKey).not.toBe(
      exported.featureDocuments[0]!.featureKey,
    );
    expect(repeated.featureUpdates[0]!.milestones[0]!.key).toBe(
      repeated.milestones[0]!.key,
    );
    expect(repeated.featureUpdates[0]!.milestones[1]!.key).not.toBe(
      exported.featureUpdates[0]!.milestones[1]!.key,
    );
    expect(repeated.featureUpdates[0]!.milestones[0]).toMatchObject({
      title: "Original milestone title",
      total: 3,
      completed: 1,
      previousTotal: 2,
      previousCompleted: 0,
    });
    const [report] = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.taskId, repeated.tasks[0]!.key));
    expect(report).toMatchObject({
      userId: null,
      externalUserName: author.name,
      eventData: { projectId: destination.project.id },
    });
    const [document] = await db
      .select()
      .from(schema.featureDocumentTable)
      .where(eq(schema.featureDocumentTable.featureId, repeated.tasks[0]!.key));
    expect(document).toMatchObject({
      createdBy: null,
      updatedBy: null,
      createdByName: author.name,
    });
  });

  it("rejects foreign Feature references before allocating any work", async () => {
    const source = await context();
    await expect(
      importHierarchy(
        source.project.id,
        {
          ...content,
          featureDocuments: [
            { ...content.featureDocuments![0]!, featureKey: "foreign-feature" },
          ],
        },
        source.user.id,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, source.project.id)),
    ).toEqual([]);
    expect(await db.select().from(schema.featureDocumentTable)).toEqual([]);
  });

  it("does not leak report milestone history from an inaccessible former project", async () => {
    const source = await context();
    const imported = await importHierarchy(
      source.project.id,
      content,
      source.user.id,
    );
    const privateWorkspace = await createWorkspaceMember({ role: "owner" });
    const privateProject = await createProjectFixture({
      workspaceId: privateWorkspace.workspace.id,
    });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: privateWorkspace.workspace.id,
      userId: source.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    await restrictToProjects(privateWorkspace.workspace.id, source.user.id, []);
    await db
      .update(schema.activityTable)
      .set({
        eventData: {
          projectId: privateProject.project.id,
          health: "off-track",
          milestones: [
            {
              id: "private-milestone",
              title: "Private title",
              position: 0,
              total: 1,
              completed: 0,
              started: 0,
              previousTotal: null,
              previousCompleted: null,
            },
          ],
        },
      })
      .where(
        eq(schema.activityTable.taskId, imported.results.tasks[0]!.task.id),
      );
    const exported = await exportTasks(source.project.id, source.user.id);
    expect(exported.featureUpdates).toEqual([]);
    expect(JSON.stringify(exported)).not.toContain("Private title");
  });
});
