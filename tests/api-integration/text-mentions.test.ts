import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import createTask from "../../apps/api/src/task/controllers/create-task";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { commentDocuments, commentKinds } from "./helpers/document-comments";
import {
  createProjectFixture,
  createWorkspaceMember,
  type SeededMemberContext,
} from "./helpers/fixtures";
import { jsonRequest } from "./helpers/release/json-request";
import {
  addMember,
  createCommentFixture,
} from "./helpers/test-case/comment-fixture";

// Creating a notification also delivers it in the background; only the inbox
// rows matter here.
vi.mock("../../apps/api/src/notification-preferences/delivery", () => ({
  deliverNotification: vi.fn(async () => undefined),
}));

const mention = (userId: string, label = "Name") =>
  `<kaneo-mention id="${userId}" label="${label}"></kaneo-mention>`;

const notifications = () =>
  db
    .select()
    .from(schema.notificationTable)
    .orderBy(schema.notificationTable.createdAt);

async function join(
  workspaceId: string,
  userName: string,
  role = "member",
): Promise<SeededMemberContext> {
  const person = await createWorkspaceMember({ userName, role });
  await db
    .update(schema.workspaceUserTable)
    .set({ workspaceId })
    .where(eq(schema.workspaceUserTable.userId, person.user.id));
  return person;
}

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.each(commentKinds)("mentions in the text of a %s", (kind) => {
  const resourceType =
    kind === "page" ? "project_document" : "feature_document";

  async function setup() {
    const author = await createWorkspaceMember({ userName: "Author" });
    const workspaceId = author.workspace.id;
    const ana = await join(workspaceId, "Ana");
    const { project } = await createProjectFixture({ workspaceId });
    const documents = await commentDocuments(kind, project.id);
    mockAuthenticatedSession(author.user);
    let revision = 1;
    const save = async (body: string) => {
      const response = await documents.request(
        documents.at(documents.documentId),
        "PUT",
        { body, expectedRevision: revision },
      );
      expect(response.status).toBe(200);
      revision += 1;
    };
    return { author, ana, workspaceId, project, documents, save };
  }

  it("tells a reader newly mentioned once, never the author", async () => {
    const ctx = await setup();
    const text = `Ask ${mention(ctx.ana.user.id, "Ana")} and ${mention(ctx.author.user.id)}`;

    await ctx.save(text);
    await ctx.save(`${text} again`);

    const rows = await notifications();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: ctx.ana.user.id,
      type: "document_mention",
      resourceType,
      resourceId: ctx.documents.documentId,
      eventData: {
        workspaceId: ctx.workspaceId,
        projectId: ctx.project.id,
        documentKind: kind,
        documentId: ctx.documents.documentId,
        documentTitle: "Handbook",
        featureId: kind === "feature" ? ctx.documents.feature.id : null,
        threadId: null,
        commentId: null,
        actorId: ctx.author.user.id,
        actorName: "Author",
        commentPreview: null,
        quote: null,
      },
    });
  });

  it("tells someone mentioned again after the mention was removed", async () => {
    const ctx = await setup();
    await ctx.save(mention(ctx.ana.user.id));
    await ctx.save("Nobody");
    await ctx.save(mention(ctx.ana.user.id));

    expect(await notifications()).toHaveLength(2);
  });

  it("leaves out members who cannot read the document and outsiders", async () => {
    const ctx = await setup();
    const outsider = await createWorkspaceMember({ userName: "Outsider" });
    const taskOnly = await join(ctx.workspaceId, "Tasks only", "taskonly");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspaceId,
      role: "taskonly",
      permission: JSON.stringify({ project: ["read"], task: ["read"] }),
    });

    await ctx.save(
      [outsider, taskOnly, ctx.ana].map((p) => mention(p.user.id)).join(" "),
    );

    expect((await notifications()).map((row) => row.userId)).toEqual([
      ctx.ana.user.id,
    ]);
  });

  it("tells the people mentioned in a document created with text", async () => {
    const ctx = await setup();
    const response = await ctx.documents.request(
      kind === "page"
        ? `/project-document/project/${ctx.project.id}`
        : `/feature/${ctx.documents.feature.id}/documents`,
      "POST",
      { title: "Notes", body: `Hi ${mention(ctx.ana.user.id)}` },
    );
    expect(response.status).toBe(200);
    const created = (await response.json()) as { id: string };

    expect(await notifications()).toMatchObject([
      {
        userId: ctx.ana.user.id,
        type: "document_mention",
        resourceType,
        resourceId: created.id,
        eventData: { documentTitle: "Notes", commentId: null },
      },
    ]);
  });
});

describe("mentions in a test case's text", () => {
  it("tells people newly mentioned in any of its texts", async () => {
    const ctx = await createCommentFixture();
    const teammate = await addMember(ctx.author.workspace.id);
    mockAuthenticatedSession(ctx.author.user);

    const save = async (input: Record<string, string>) =>
      expect((await ctx.request("PATCH", "", input)).status).toBe(200);
    await save({ steps: `Ask ${mention(teammate.id)}` });
    // Moved to another text, still the same person.
    await save({ steps: "Ask", expectedResult: mention(teammate.id) });

    expect(await notifications()).toMatchObject([
      {
        userId: teammate.id,
        type: "test_case_mention",
        resourceType: "test_case",
        resourceId: ctx.testCase.id,
        eventData: { testCaseTitle: "Checks out" },
      },
    ]);
  });

  it("tells the people mentioned in a test case created with text", async () => {
    const ctx = await createCommentFixture();
    const teammate = await addMember(ctx.author.workspace.id);
    mockAuthenticatedSession(ctx.author.user);

    const response = await ctx.app.request(
      `/api/test-case/project/${ctx.project.id}`,
      jsonRequest("POST", {
        title: "Logs in",
        description: `${mention(teammate.id)} ${mention(ctx.author.user.id)}`,
      }),
    );
    expect(response.status).toBe(200);

    expect(await notifications()).toMatchObject([
      {
        userId: teammate.id,
        type: "test_case_mention",
        eventData: { testCaseTitle: "Logs in" },
      },
    ]);
  });
});

describe("mentions in a new task's description", () => {
  it("tells the people mentioned when the task is created", async () => {
    const author = await createWorkspaceMember({ userName: "Author" });
    const ana = await join(author.workspace.id, "Ana");
    const { project } = await createProjectFixture({
      workspaceId: author.workspace.id,
    });

    const task = await createTask({
      projectId: project.id,
      currentUserId: author.user.id,
      title: "Ship it",
      status: "to-do",
      description: `${mention(ana.user.id)} ${mention(author.user.id)}`,
    });

    expect(await notifications()).toMatchObject([
      {
        userId: ana.user.id,
        type: "task_mention",
        resourceType: "task",
        resourceId: task.id,
        eventData: { taskTitle: "Ship it", mentionerName: "Author" },
      },
    ]);
  });
});
