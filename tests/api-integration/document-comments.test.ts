import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  anchor,
  commentDocuments,
  commentKinds,
  type CommentKind,
  type Thread,
} from "./helpers/document-comments";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";

// Records each event while still delivering it, so the WebSocket layer runs.
const publish = vi.hoisted(() =>
  vi.fn(async (_event: string, _data?: unknown) => undefined),
);
vi.mock("../../apps/api/src/events", async (original) => {
  const actual = await original<typeof import("../../apps/api/src/events")>();
  publish.mockImplementation(actual.publishEvent);
  return { ...actual, publishEvent: publish };
});

// Records each notice, and whether its comment was committed by then, while
// still running the real notifier.
const notices = vi.hoisted(() => ({
  seen: [] as { notice: unknown; committed: boolean; eventsBefore: number }[],
}));
vi.mock(
  "../../apps/api/src/notification/document-comment/notify-document-comment",
  async (original) => {
    const actual =
      await original<
        typeof import("../../apps/api/src/notification/document-comment/notify-document-comment")
      >();
    return {
      ...actual,
      notifyDocumentComment: async (
        notice: Parameters<typeof actual.notifyDocumentComment>[0],
      ) => {
        const stored = await db
          .select({ id: schema.documentCommentTable.id })
          .from(schema.documentCommentTable)
          .where(eq(schema.documentCommentTable.id, notice.comment.id));
        notices.seen.push({
          notice,
          committed: stored.length === 1,
          eventsBefore: commentEvents().length,
        });
        return actual.notifyDocumentComment(notice);
      },
    };
  },
);

beforeEach(async () => {
  await resetTestDatabase();
  publish.mockClear();
  notices.seen = [];
});

async function setup(kind: CommentKind) {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Olive Owner",
  });
  await db
    .update(schema.userTable)
    .set({ image: "https://example.com/olive.png" })
    .where(eq(schema.userTable.id, owner.id));
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    slug: "DC",
  });
  const member = await addWorkspaceMember(workspace.id);
  mockAuthenticatedSession(owner);
  return {
    ...(await commentDocuments(kind, project.id)),
    owner,
    member,
    workspace,
    project,
    as: (user: typeof owner) => mockAuthenticatedSession(user),
  };
}

const commentEvents = () =>
  publish.mock.calls
    .filter(([event]) => event === "document.comment.changed")
    .map(([, data]) => data as Record<string, unknown>);

const storedComments = () =>
  db
    .select({ id: schema.documentCommentTable.id })
    .from(schema.documentCommentTable);

describe.each(commentKinds)("comments on a %s document", (kind) => {
  it("starts a thread on quoted text without touching the document", async () => {
    const ctx = await setup(kind);
    const created = await ctx.comments("", "POST", {
      content: "  Is this still true?  ",
      anchor: { quote: " quoted text ", prefix: "before", suffix: "after\n" },
    });
    expect(created.status).toBe(200);
    const thread = (await created.json()) as Thread;
    expect(thread).toEqual({
      id: expect.any(String),
      parentId: null,
      userId: ctx.owner.id,
      userName: "Olive Owner",
      userImage: "https://example.com/olive.png",
      content: "Is this still true?",
      createdAt: expect.any(String),
      editedAt: null,
      anchor: { quote: " quoted text ", prefix: "before", suffix: "after\n" },
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      replies: [],
    });
    expect(await ctx.list()).toEqual([thread]);
    expect(
      await (await ctx.request(ctx.at(ctx.documentId))).json(),
    ).toMatchObject({ body: "before quoted text after", revision: 1 });
  });

  it("lists threads and their replies oldest first, resolved ones included", async () => {
    const ctx = await setup(kind);
    const first = await ctx.start("First");
    const second = await ctx.start("Second");
    ctx.as(ctx.member);
    const reply = await ctx.comments(`/${first.id}/replies`, "POST", {
      content: " One ",
    });
    expect(reply.status).toBe(200);
    expect(((await reply.json()) as Thread).replies).toEqual([
      expect.objectContaining({
        parentId: first.id,
        userId: ctx.member.id,
        userName: ctx.member.name,
        content: "One",
        editedAt: null,
      }),
    ]);
    ctx.as(ctx.owner);
    await ctx.comments(`/${first.id}/replies`, "POST", { content: "Two" });
    await ctx.comments(`/${second.id}/resolution`, "PUT", { resolved: true });

    const threads = await ctx.list();
    expect(threads.map((thread) => thread.content)).toEqual([
      "First",
      "Second",
    ]);
    expect(threads[0]!.replies.map((item) => item.content)).toEqual([
      "One",
      "Two",
    ]);
    expect(threads[1]).toMatchObject({
      resolvedBy: ctx.owner.id,
      resolvedByName: "Olive Owner",
      replies: [],
    });
  });

  it("accepts replies only on a thread of the same document, and a reply reopens it", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.start();
    await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: true });
    ctx.as(ctx.member);
    const reopened = await ctx.comments(`/${thread.id}/replies`, "POST", {
      content: "Not done yet",
    });
    expect(reopened.status).toBe(200);
    const withReply = (await reopened.json()) as Thread;
    expect(withReply).toMatchObject({
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
    });

    const reply = withReply.replies[0]!;
    expect(
      (
        await ctx.comments(`/${reply.id}/replies`, "POST", {
          content: "Nested",
        })
      ).status,
    ).toBe(404);
    const other = await ctx.insert("Elsewhere");
    expect(
      (
        await ctx.request(
          `${ctx.at(other)}/comments/${thread.id}/replies`,
          "POST",
          { content: "Wrong document" },
        )
      ).status,
    ).toBe(404);
    expect(
      (await ctx.comments("/missing/replies", "POST", { content: "Lost" }))
        .status,
    ).toBe(404);
    expect((await ctx.list())[0]!.replies).toHaveLength(1);
  });

  it("lets only the author edit a comment, and marks the edit", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.start("Draft");
    ctx.as(ctx.member);
    const reply = (
      (await (
        await ctx.comments(`/${thread.id}/replies`, "POST", {
          content: "Reply",
        })
      ).json()) as Thread
    ).replies[0]!;
    const refused = await ctx.comments(`/${thread.id}`, "PUT", {
      content: "Hijacked",
    });
    expect(refused.status).toBe(403);

    const editedReply = await ctx.comments(`/${reply.id}`, "PUT", {
      content: " Reply, reworded ",
    });
    expect(editedReply.status).toBe(200);
    expect(await editedReply.json()).toMatchObject({
      id: thread.id,
      content: "Draft",
      editedAt: null,
      replies: [
        {
          id: reply.id,
          content: "Reply, reworded",
          editedAt: expect.any(String),
        },
      ],
    });

    ctx.as(ctx.owner);
    const edited = await ctx.comments(`/${thread.id}`, "PUT", {
      content: "Final",
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      id: thread.id,
      content: "Final",
      editedAt: expect.any(String),
      anchor: thread.anchor,
    });
    const other = await ctx.insert("Elsewhere");
    expect(
      (
        await ctx.request(`${ctx.at(other)}/comments/${thread.id}`, "PUT", {
          content: "Wrong document",
        })
      ).status,
    ).toBe(404);
    expect(
      (await ctx.comments("/missing", "PUT", { content: "Lost" })).status,
    ).toBe(404);
  });

  it("deletes a reply alone and a root with its replies, for their authors only", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.start();
    const kept = await ctx.start("Kept");
    ctx.as(ctx.member);
    const replies: string[] = [];
    for (const content of ["One", "Two", "Three"]) {
      const response = await ctx.comments(`/${thread.id}/replies`, "POST", {
        content,
      });
      replies.push(((await response.json()) as Thread).replies.at(-1)!.id);
    }
    expect((await ctx.comments(`/${thread.id}`, "DELETE")).status).toBe(403);
    const other = await ctx.insert("Elsewhere");
    expect(
      (await ctx.request(`${ctx.at(other)}/comments/${replies[0]}`, "DELETE"))
        .status,
    ).toBe(404);

    const reply = await ctx.comments(`/${replies[0]}`, "DELETE");
    expect(reply.status).toBe(200);
    expect(await reply.json()).toEqual({
      id: replies[0],
      parentId: thread.id,
      deletedCount: 1,
    });

    ctx.as(ctx.owner);
    expect((await ctx.comments(`/${replies[1]}`, "DELETE")).status).toBe(403);
    const root = await ctx.comments(`/${thread.id}`, "DELETE");
    expect(root.status).toBe(200);
    expect(await root.json()).toEqual({
      id: thread.id,
      parentId: null,
      deletedCount: 3,
    });
    expect((await ctx.comments(`/${thread.id}`, "DELETE")).status).toBe(404);
    expect((await ctx.list()).map((item) => item.id)).toEqual([kept.id]);
    expect(await storedComments()).toEqual([{ id: kept.id }]);
  });

  it("resolves and reopens a thread for anyone who may edit, changing nothing when repeated", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.start();
    ctx.as(ctx.member);
    const resolved = (await (
      await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: true })
    ).json()) as Thread;
    expect(resolved).toMatchObject({
      resolvedAt: expect.any(String),
      resolvedBy: ctx.member.id,
      resolvedByName: ctx.member.name,
      editedAt: null,
    });

    ctx.as(ctx.owner);
    const again = await ctx.comments(`/${thread.id}/resolution`, "PUT", {
      resolved: true,
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(resolved);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reopened = await ctx.comments(`/${thread.id}/resolution`, "PUT", {
        resolved: false,
      });
      expect(reopened.status).toBe(200);
      expect(await reopened.json()).toEqual({
        ...resolved,
        resolvedAt: null,
        resolvedBy: null,
        resolvedByName: null,
      });
    }

    const reply = (
      (await (
        await ctx.comments(`/${thread.id}/replies`, "POST", { content: "Re" })
      ).json()) as Thread
    ).replies[0]!;
    expect(
      (
        await ctx.comments(`/${reply.id}/resolution`, "PUT", {
          resolved: true,
        })
      ).status,
    ).toBe(404);
  });

  it("bounds comment text and anchors", async () => {
    const ctx = await setup(kind);
    const post = (body: unknown) => ctx.comments("", "POST", body);
    const longest = await post({
      content: "c".repeat(10_000),
      anchor: {
        quote: "q".repeat(2_000),
        prefix: "p".repeat(200),
        suffix: "",
      },
    });
    expect(longest.status).toBe(200);
    const thread = (await longest.json()) as Thread;

    const half = "🚀".slice(0, 1);
    for (const body of [
      { content: "c".repeat(10_001), anchor: anchor("q") },
      { content: "   ", anchor: anchor("q") },
      { content: "nul\u0000", anchor: anchor("q") },
      { content: "ok", anchor: anchor("q".repeat(2_001)) },
      { content: "ok", anchor: anchor("") },
      { content: "ok", anchor: anchor("nul\u0000") },
      { content: "ok", anchor: anchor(`cut ${half}`) },
      { content: "ok", anchor: { ...anchor("q"), prefix: "p".repeat(201) } },
      { content: "ok", anchor: { ...anchor("q"), suffix: "s".repeat(201) } },
      { content: "ok", anchor: { quote: "q", prefix: "" } },
      { content: "ok", anchor: { ...anchor("q"), offset: 4 } },
      { content: "ok", anchor: anchor("q"), draftAssetIds: ["asset"] },
      { content: "ok" },
    ])
      expect((await post(body)).status, JSON.stringify(body).slice(0, 80)).toBe(
        400,
      );
    for (const [path, method, body] of [
      [`/${thread.id}/replies`, "POST", { content: "r".repeat(10_001) }],
      [`/${thread.id}/replies`, "POST", { content: "ok", anchor: anchor("q") }],
      [`/${thread.id}`, "PUT", { content: "" }],
      [`/${thread.id}`, "PUT", { content: "ok", anchor: anchor("q") }],
      [`/${thread.id}/resolution`, "PUT", { resolved: "yes" }],
      [`/${thread.id}/resolution`, "PUT", {}],
    ] as const)
      expect((await ctx.comments(path, method, body)).status, path).toBe(400);
    expect(await storedComments()).toEqual([{ id: thread.id }]);
  });

  it("moves anchors with a document save, leaving comments unedited", async () => {
    const ctx = await setup(kind);
    const moved = await ctx.start("Moved", "one");
    const still = await ctx.start("Still", "two");
    const resolved = await ctx.start("Resolved", "three");
    await ctx.comments(`/${resolved.id}/resolution`, "PUT", { resolved: true });
    const reply = (
      (await (
        await ctx.comments(`/${moved.id}/replies`, "POST", { content: "Re" })
      ).json()) as Thread
    ).replies[0]!;
    const other = await ctx.insert("Elsewhere", "four");
    const foreign = (await (
      await ctx.request(`${ctx.at(other)}/comments`, "POST", {
        content: "Foreign",
        anchor: anchor("four"),
      })
    ).json()) as Thread;

    const next = { quote: " one! ", prefix: "", suffix: "more" };
    const saved = await ctx.request(ctx.at(ctx.documentId), "PUT", {
      body: "one! two three",
      expectedRevision: 1,
      commentAnchors: [
        { id: moved.id, quote: "superseded", prefix: "", suffix: "" },
        { id: moved.id, ...next },
        { id: still.id, ...still.anchor },
        { id: resolved.id, ...anchor("three, moved") },
        { id: reply.id, ...anchor("reply") },
        { id: foreign.id, ...anchor("stolen") },
        { id: "missing", ...anchor("nothing") },
      ],
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      body: "one! two three",
      revision: 2,
    });

    expect(await ctx.list()).toEqual([
      { ...moved, anchor: next, replies: [reply] },
      still,
      {
        ...resolved,
        anchor: anchor("three, moved"),
        resolvedAt: expect.any(String),
        resolvedBy: ctx.owner.id,
        resolvedByName: "Olive Owner",
      },
    ]);
    expect(
      (await (
        await ctx.request(`${ctx.at(other)}/comments`)
      ).json()) as Thread[],
    ).toEqual([foreign]);
    expect(
      await db
        .select({
          quote: schema.documentCommentTable.anchorQuote,
          editedAt: schema.documentCommentTable.editedAt,
        })
        .from(schema.documentCommentTable)
        .where(eq(schema.documentCommentTable.id, reply.id)),
    ).toEqual([{ quote: null, editedAt: null }]);
  });

  it("applies no anchors when the save is refused", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.start();
    const stale = await ctx.request(ctx.at(ctx.documentId), "PUT", {
      body: "lost",
      expectedRevision: 7,
      commentAnchors: [{ id: thread.id, ...anchor("lost") }],
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "DOCUMENT_CONFLICT" });

    const entry = { id: thread.id, ...anchor("too many") };
    for (const commentAnchors of [
      Array.from({ length: 201 }, () => entry),
      [{ ...entry, quote: "" }],
      [{ ...entry, quote: "q".repeat(2_001) }],
      [{ ...entry, quote: "nul\u0000" }],
      [{ ...entry, quote: "🚀".slice(1) }],
      [{ ...entry, id: "" }],
      [{ ...entry, content: "rewritten" }],
    ])
      expect(
        (
          await ctx.request(ctx.at(ctx.documentId), "PUT", {
            body: "lost",
            expectedRevision: 1,
            commentAnchors,
          })
        ).status,
      ).toBe(400);

    expect(await ctx.list()).toEqual([thread]);
    expect(
      await (await ctx.request(ctx.at(ctx.documentId))).json(),
    ).toMatchObject({ body: "before quoted text after", revision: 1 });
    expect(
      (
        await ctx.request(ctx.at(ctx.documentId), "PUT", {
          title: "Renamed",
          expectedRevision: 1,
          commentAnchors: Array.from({ length: 200 }, () => entry),
        })
      ).status,
    ).toBe(200);
    expect((await ctx.list())[0]!.anchor).toEqual(anchor("too many"));
  });

  it("publishes one id-only event per change and none for refusals or repeats", async () => {
    const ctx = await setup(kind);
    const scope = {
      projectId: ctx.project.id,
      documentId: ctx.documentId,
      documentKind: kind,
      ...(kind === "feature" ? { featureId: ctx.feature.id } : {}),
    };
    const thread = await ctx.start("Secret remark", "secret quote");
    ctx.as(ctx.member);
    const reply = (
      (await (
        await ctx.comments(`/${thread.id}/replies`, "POST", {
          content: "Secret reply",
        })
      ).json()) as Thread
    ).replies[0]!;
    await ctx.comments(`/${reply.id}`, "PUT", { content: "Secret edit" });
    await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: true });
    await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: true });
    await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: false });
    await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: false });
    await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: true });
    await ctx.comments(`/${thread.id}/replies`, "POST", { content: "Reopen" });
    // Refused: not the author, unknown ids and an invalid body.
    await ctx.comments(`/${thread.id}`, "PUT", { content: "Hijacked" });
    await ctx.comments(`/${thread.id}`, "DELETE");
    await ctx.comments("/missing/replies", "POST", { content: "Lost" });
    await ctx.comments("/missing/resolution", "PUT", { resolved: true });
    await ctx.comments("", "POST", { content: "", anchor: anchor("q") });
    await ctx.comments(`/${reply.id}`, "DELETE");
    ctx.as(ctx.owner);
    await ctx.comments(`/${thread.id}`, "DELETE");

    const member = { ...scope, userId: ctx.member.id };
    const events = commentEvents();
    expect(events).toEqual([
      {
        ...scope,
        userId: ctx.owner.id,
        change: "created",
        threadId: thread.id,
        commentId: thread.id,
      },
      {
        ...member,
        change: "replied",
        threadId: thread.id,
        commentId: reply.id,
      },
      { ...member, change: "edited", threadId: thread.id, commentId: reply.id },
      { ...member, change: "resolved", threadId: thread.id },
      { ...member, change: "reopened", threadId: thread.id },
      { ...member, change: "resolved", threadId: thread.id },
      {
        ...member,
        change: "replied",
        threadId: thread.id,
        commentId: expect.any(String),
      },
      {
        ...member,
        change: "deleted",
        threadId: thread.id,
        commentId: reply.id,
      },
      {
        ...scope,
        userId: ctx.owner.id,
        change: "deleted",
        threadId: thread.id,
        commentId: thread.id,
      },
    ]);
    for (const event of events) {
      expect(event).not.toHaveProperty("content");
      expect(event).not.toHaveProperty("quote");
      expect(event).not.toHaveProperty("anchor");
    }
    expect(JSON.stringify(events)).not.toMatch(/secret/i);
    // Integrations mirror task comments from this event.
    expect(
      publish.mock.calls.filter(([event]) => event.startsWith("comment.")),
    ).toEqual([]);
  });

  it("hands each new thread and reply to the notifier once committed and announced, and nothing else", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.start("Root text", "the quote");
    ctx.as(ctx.member);
    const reply = (
      (await (
        await ctx.comments(`/${thread.id}/replies`, "POST", {
          content: "Reply text",
        })
      ).json()) as Thread
    ).replies[0]!;
    await ctx.comments(`/${reply.id}`, "PUT", { content: "Reworded" });
    await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: true });
    await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: false });
    await ctx.comments(`/${thread.id}`, "PUT", { content: "Hijacked" });
    await ctx.comments("/missing/replies", "POST", { content: "Lost" });
    await ctx.comments(`/${reply.id}`, "DELETE");
    await ctx.request(ctx.at(ctx.documentId), "PUT", {
      expectedRevision: 1,
      commentAnchors: [{ id: thread.id, ...anchor("moved") }],
    });

    const scope = {
      document:
        kind === "page"
          ? { kind, id: ctx.documentId, title: "Handbook" }
          : {
              kind,
              id: ctx.documentId,
              title: "Handbook",
              featureId: ctx.feature.id,
            },
      projectId: ctx.project.id,
      workspaceId: ctx.workspace.id,
      quote: "the quote",
    };
    expect(notices.seen).toEqual([
      {
        notice: {
          ...scope,
          comment: {
            id: thread.id,
            parentId: null,
            userId: ctx.owner.id,
            content: "Root text",
          },
        },
        committed: true,
        eventsBefore: 1,
      },
      {
        notice: {
          ...scope,
          comment: {
            id: reply.id,
            parentId: thread.id,
            userId: ctx.member.id,
            content: "Reply text",
          },
        },
        committed: true,
        eventsBefore: 2,
      },
    ]);
  });

  it("announces moved anchors only when a save changed one", async () => {
    const ctx = await setup(kind);
    const thread = await ctx.start();
    const other = await ctx.insert("Elsewhere");
    const foreign = (await (
      await ctx.request(`${ctx.at(other)}/comments`, "POST", {
        content: "Foreign",
        anchor: anchor("four"),
      })
    ).json()) as Thread;
    publish.mockClear();
    const save = (expectedRevision: number, commentAnchors?: unknown) =>
      ctx.request(ctx.at(ctx.documentId), "PUT", {
        body: `revision ${expectedRevision}`,
        expectedRevision,
        ...(commentAnchors ? { commentAnchors } : {}),
      });

    expect((await save(1)).status).toBe(200);
    expect((await save(2, [{ id: thread.id, ...thread.anchor }])).status).toBe(
      200,
    );
    expect(
      (
        await save(3, [
          { id: foreign.id, ...anchor("stolen") },
          { id: "missing", ...anchor("nothing") },
        ])
      ).status,
    ).toBe(200);
    expect(
      (await save(1, [{ id: thread.id, ...anchor("stale") }])).status,
    ).toBe(409);
    expect(commentEvents()).toEqual([]);

    expect(
      (await save(4, [{ id: thread.id, ...anchor("moved") }])).status,
    ).toBe(200);
    expect(commentEvents()).toEqual([
      {
        projectId: ctx.project.id,
        documentId: ctx.documentId,
        documentKind: kind,
        ...(kind === "feature" ? { featureId: ctx.feature.id } : {}),
        change: "anchors",
        userId: ctx.owner.id,
      },
    ]);
  });
});

describe("comments when their document is deleted", () => {
  it("go with a page, and with a page deleted through its parent", async () => {
    const ctx = await setup("page");
    const child = await ctx.request(
      `/project-document/project/${ctx.project.id}`,
      "POST",
      { title: "Child", parentId: ctx.documentId },
    );
    const { id: childId } = (await child.json()) as { id: string };
    const lone = await ctx.insert("Lone");
    for (const documentId of [ctx.documentId, childId, lone]) {
      const thread = (await (
        await ctx.request(`${ctx.at(documentId)}/comments`, "POST", {
          content: "Thread",
          anchor: anchor("q"),
        })
      ).json()) as Thread;
      await ctx.request(
        `${ctx.at(documentId)}/comments/${thread.id}/replies`,
        "POST",
        { content: "Reply" },
      );
    }
    expect(await storedComments()).toHaveLength(6);

    expect((await ctx.request(ctx.at(lone), "DELETE")).status).toBe(200);
    expect(await storedComments()).toHaveLength(4);
    expect((await ctx.request(ctx.at(ctx.documentId), "DELETE")).status).toBe(
      200,
    );
    expect(await storedComments()).toEqual([]);
    expect((await ctx.comments()).status).toBe(404);
  });

  it("go with a Feature document, and with its Feature", async () => {
    const ctx = await setup("feature");
    const second = await ctx.insert("Second");
    for (const documentId of [ctx.documentId, second]) {
      const thread = (await (
        await ctx.request(`${ctx.at(documentId)}/comments`, "POST", {
          content: "Thread",
          anchor: anchor("q"),
        })
      ).json()) as Thread;
      await ctx.request(
        `${ctx.at(documentId)}/comments/${thread.id}/replies`,
        "POST",
        { content: "Reply" },
      );
    }
    expect((await ctx.request(ctx.at(second), "DELETE")).status).toBe(200);
    expect(await storedComments()).toHaveLength(2);
    expect((await ctx.request(`${ctx.at(second)}/comments`)).status).toBe(404);

    await db
      .delete(schema.taskTable)
      .where(eq(schema.taskTable.id, ctx.feature.id));
    expect(await storedComments()).toEqual([]);
  });

  it("keep a comment, without its author, when the author's account is deleted", async () => {
    const ctx = await setup("page");
    const thread = await ctx.start();
    ctx.as(ctx.member);
    await ctx.comments(`/${thread.id}/replies`, "POST", { content: "Reply" });
    await ctx.comments(`/${thread.id}/resolution`, "PUT", { resolved: true });
    ctx.as(ctx.owner);
    await db
      .delete(schema.userTable)
      .where(eq(schema.userTable.id, ctx.member.id));
    expect(await ctx.list()).toEqual([
      {
        ...thread,
        resolvedAt: expect.any(String),
        resolvedBy: null,
        resolvedByName: null,
        replies: [
          expect.objectContaining({
            content: "Reply",
            userId: null,
            userName: null,
            userImage: null,
          }),
        ],
      },
    ]);
  });
});
