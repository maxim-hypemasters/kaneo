import { and, eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import getNotifications from "../../apps/api/src/notification/controllers/get-notifications";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  type CommentKind,
  commentDocuments,
  commentKinds,
} from "./helpers/document-comments";
import {
  createProjectFixture,
  createWorkspaceMember,
  type SeededMemberContext,
} from "./helpers/fixtures";

const { deliverNotification } = await vi.importActual<
  typeof import("../../apps/api/src/notification-preferences/delivery")
>("../../apps/api/src/notification-preferences/delivery");

const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => undefined),
}));
vi.mock("@kaneo/email", async (original) => ({
  ...(await original<object>()),
  sendNotificationEmail: sendEmail,
}));
// Creating a notification also delivers it in the background; the tests
// deliver by hand so each channel is checked once.
vi.mock("../../apps/api/src/notification-preferences/delivery", () => ({
  deliverNotification: vi.fn(async () => undefined),
}));

const mention = (person: SeededMemberContext) =>
  `<kaneo-mention id="${person.user.id}" label="${person.user.name}"></kaneo-mention>`;

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

// A document with three people who can comment on it. Requests are made as
// whoever `as` named last.
async function setup(kind: CommentKind) {
  const author = await createWorkspaceMember({ userName: "Author" });
  const workspaceId = author.workspace.id;
  const ana = await join(workspaceId, "Ana");
  const ben = await join(workspaceId, "Ben");
  const { project } = await createProjectFixture({ workspaceId });
  const documents = await commentDocuments(kind, project.id);
  const as = (person: SeededMemberContext) =>
    mockAuthenticatedSession(person.user);
  const reply = async (threadId: string, content: string) => {
    const response = await documents.comments(`/${threadId}/replies`, "POST", {
      content,
    });
    expect(response.status).toBe(200);
  };
  const notifications = () =>
    db
      .select()
      .from(schema.notificationTable)
      .orderBy(schema.notificationTable.createdAt);
  as(author);
  return {
    author,
    ana,
    ben,
    workspaceId,
    project,
    documents,
    as,
    reply,
    notifications,
  };
}

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.each(commentKinds)("comment notifications on a %s", (kind) => {
  const resourceType =
    kind === "page" ? "project_document" : "feature_document";

  it("notifies the people mentioned when a thread starts, never its author", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.documents.start(
      `Can you check, ${mention(ctx.ana)} and ${mention(ctx.author)}?`,
    );
    const rows = await ctx.notifications();
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
        threadId: thread.id,
        commentId: thread.id,
        actorId: ctx.author.user.id,
        actorName: "Author",
        commentPreview: "Can you check, @Ana and @Author?",
        quote: "quoted text",
      },
    });
  });

  it("notifies a thread's starter and earlier repliers of a reply, with one mention for someone who is both", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.documents.start("Too tight?");
    expect(await ctx.notifications()).toEqual([]);

    ctx.as(ctx.ana);
    await ctx.reply(thread.id, "I think so");
    expect(
      (await ctx.notifications()).map((row) => [row.userId, row.type]),
    ).toEqual([[ctx.author.user.id, "document_comment_reply"]]);

    ctx.as(ctx.ben);
    await ctx.reply(thread.id, `Agreed, ${mention(ctx.ana)}`);
    const rows = (await ctx.notifications()).slice(1);
    expect(
      rows
        .map((row) => [row.userId, row.type])
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    ).toEqual([
      [ctx.author.user.id, "document_comment_reply"],
      [ctx.ana.user.id, "document_mention"],
    ]);
    expect(rows[0].eventData).toMatchObject({
      threadId: thread.id,
      actorName: "Ben",
      quote: "quoted text",
    });
    expect((rows[0].eventData as { commentId: string }).commentId).not.toBe(
      thread.id,
    );
  });

  it("notifies nobody when a comment is edited, resolved, reopened or deleted", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.documents.start("First");
    ctx.as(ctx.ana);
    await ctx.reply(thread.id, "Second");
    const before = await ctx.notifications();
    expect(before).toHaveLength(1);

    ctx.as(ctx.author);
    for (const [path, method, body] of [
      [`/${thread.id}`, "PUT", { content: `Edited ${mention(ctx.ben)}` }],
      [`/${thread.id}/resolution`, "PUT", { resolved: true }],
      [`/${thread.id}/resolution`, "PUT", { resolved: false }],
      [`/${thread.id}`, "DELETE", undefined],
    ] as const)
      expect((await ctx.documents.comments(path, method, body)).status).toBe(
        200,
      );
    expect(await ctx.notifications()).toHaveLength(before.length);
  });

  it("leaves out people who cannot read the document, outsiders and people who turned comments off", async () => {
    const ctx = await setup(kind);
    const outsider = await createWorkspaceMember({ userName: "Outsider" });
    // Can read tasks only: neither pages nor Feature documents.
    const taskOnly = await join(ctx.workspaceId, "Tasks only", "taskonly");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: ctx.workspaceId,
      role: "taskonly",
      permission: JSON.stringify({ project: ["read"], task: ["read"] }),
    });
    await db
      .insert(schema.userNotificationPreferenceTable)
      .values({ userId: ctx.ben.user.id, taskCommentEnabled: false });

    await ctx.documents.start(
      [outsider, taskOnly, ctx.ben, ctx.ana].map(mention).join(" "),
    );
    expect((await ctx.notifications()).map((row) => row.userId)).toEqual([
      ctx.ana.user.id,
    ]);
  });

  it("lists the notification with where the document is now, and drops it with the document or the membership", async () => {
    const ctx = await setup(kind);
    const other = await createWorkspaceMember();
    await ctx.documents.start(`Hello ${mention(ctx.ana)}`);

    const listed = await getNotifications(ctx.ana.user.id, ctx.workspaceId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      type: "document_mention",
      taskType: null,
      eventData: { projectId: ctx.project.id, workspaceId: ctx.workspaceId },
    });
    expect(await getNotifications(ctx.ana.user.id, other.workspace.id)).toEqual(
      [],
    );

    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.userId, ctx.ana.user.id),
          eq(schema.workspaceUserTable.workspaceId, ctx.workspaceId),
        ),
      );
    expect(await getNotifications(ctx.ana.user.id)).toEqual([]);
  });

  it("stops listing the notification once the document is deleted", async () => {
    const ctx = await setup(kind);
    await ctx.documents.start(`Hello ${mention(ctx.ana)}`);
    expect(await getNotifications(ctx.ana.user.id)).toHaveLength(1);
    await (kind === "page"
      ? db
          .delete(schema.projectDocumentTable)
          .where(eq(schema.projectDocumentTable.id, ctx.documents.documentId))
      : db
          .delete(schema.featureDocumentTable)
          .where(eq(schema.featureDocumentTable.id, ctx.documents.documentId)));
    expect(await getNotifications(ctx.ana.user.id)).toEqual([]);
  });

  it("delivers a link that opens the document on the thread", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.documents.start(`Hello ${mention(ctx.ana)}`);
    const [notification] = await ctx.notifications();
    await db.insert(schema.userNotificationPreferenceTable).values({
      userId: ctx.ana.user.id,
      emailEnabled: true,
      webhookEnabled: true,
      webhookUrl: "http://127.0.0.1/hook",
    });
    await db.insert(schema.userNotificationWorkspaceRuleTable).values({
      userId: ctx.ana.user.id,
      workspaceId: ctx.workspaceId,
      isActive: true,
      emailEnabled: true,
      webhookEnabled: true,
    });
    vi.stubEnv("KANEO_CLIENT_URL", "https://kaneo.example");
    vi.stubEnv("KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS", "true");
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await deliverNotification(notification.id);

    const url = new URL(
      `https://kaneo.example/dashboard/workspace/${ctx.workspaceId}/project/${ctx.project.id}`,
    );
    url.searchParams.set("tab", "documents");
    url.searchParams.set("documentId", ctx.documents.documentId);
    if (kind === "feature")
      url.searchParams.set("documentFeatureId", ctx.documents.feature.id);
    url.searchParams.set("commentId", thread.id);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0]).toEqual([
      ctx.ana.user.email,
      "Author mentioned you",
      expect.objectContaining({
        message: "You were mentioned in a comment on Handbook.",
        actionUrl: url.toString(),
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      notification: { type: "document_mention", resourceType },
      project: { id: ctx.project.id },
      task: null,
      document: {
        id: ctx.documents.documentId,
        kind,
        title: "Handbook",
        url: url.toString(),
      },
    });
  });
});
