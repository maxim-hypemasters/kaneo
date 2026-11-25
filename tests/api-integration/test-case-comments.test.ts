import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import { createWorkspaceMember } from "./helpers/fixtures";
import {
  addMember,
  createCommentFixture,
} from "./helpers/test-case/comment-fixture";

const publish = vi.hoisted(() =>
  vi.fn(async (_event: string, _data?: unknown) => undefined),
);
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<object>()),
  publishEvent: publish,
}));

beforeEach(async () => {
  await resetTestDatabase();
  publish.mockClear();
});

type Comment = {
  id: string;
  testCaseId: string;
  content: string;
  author: { id: string; name: string; image: string | null } | null;
};
const list = async (ctx: Awaited<ReturnType<typeof createCommentFixture>>) =>
  (
    (await (await ctx.request("GET", "/comments")).json()) as {
      data: Comment[];
    }
  ).data;

describe("test case comments", () => {
  it("adds, lists oldest first, edits and deletes a comment", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession(ctx.author.user);

    const created = await ctx.request("POST", "/comments", {
      content: "  Fails on Safari  ",
    });
    expect(created.status).toBe(200);
    const first = (await created.json()) as Comment;
    expect(first).toMatchObject({
      testCaseId: ctx.testCase.id,
      content: "Fails on Safari",
      author: { id: ctx.author.user.id, name: ctx.author.user.name },
    });
    await ctx.request("POST", "/comments", { content: "Retested" });
    expect((await list(ctx)).map((comment) => comment.content)).toEqual([
      "Fails on Safari",
      "Retested",
    ]);

    const edited = await ctx.request("PATCH", `/comments/${first.id}`, {
      content: "Fails on Safari 17",
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      id: first.id,
      content: "Fails on Safari 17",
    });

    const removed = await ctx.request("DELETE", `/comments/${first.id}`);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ id: first.id });
    expect((await list(ctx)).map((comment) => comment.content)).toEqual([
      "Retested",
    ]);
  });

  it("tells the project about each change, without the comment itself", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession(ctx.author.user);
    const created = (await (
      await ctx.request("POST", "/comments", { content: "Private note" })
    ).json()) as Comment;
    await ctx.request("PATCH", `/comments/${created.id}`, { content: "Edit" });
    await ctx.request("DELETE", `/comments/${created.id}`);
    const changes = publish.mock.calls.filter(
      ([event]) => event === "test-case.comment.changed",
    );
    expect(changes).toHaveLength(3);
    for (const [, data] of changes)
      expect(data).toEqual({
        projectId: ctx.project.id,
        testCaseId: ctx.testCase.id,
        userId: ctx.author.user.id,
      });
  });

  it("rejects an empty or oversized comment", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession(ctx.author.user);
    for (const content of ["   ", "x".repeat(10_001)])
      expect((await ctx.request("POST", "/comments", { content })).status).toBe(
        400,
      );
    expect(
      (await ctx.request("POST", "/comments", { content: "x".repeat(10_000) }))
        .status,
    ).toBe(200);
  });

  it("lets only the author edit or delete a comment", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession(ctx.author.user);
    const comment = (await (
      await ctx.request("POST", "/comments", { content: "Mine" })
    ).json()) as Comment;

    mockAuthenticatedSession(await addMember(ctx.author.workspace.id, "admin"));
    const edit = await ctx.request("PATCH", `/comments/${comment.id}`, {
      content: "Changed",
    });
    expect(edit.status).toBe(404);
    expect((await readErrorBody(edit)).message).toBe(
      "Comment not found or you are not the author",
    );
    expect(
      (await ctx.request("DELETE", `/comments/${comment.id}`)).status,
    ).toBe(404);
    expect((await list(ctx)).map((item) => item.content)).toEqual(["Mine"]);
  });

  it("lets a viewer read but not write", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession(ctx.author.user);
    const comment = (await (
      await ctx.request("POST", "/comments", { content: "Visible" })
    ).json()) as Comment;

    mockAuthenticatedSession(
      await addMember(ctx.author.workspace.id, "viewer"),
    );
    expect((await list(ctx)).map((item) => item.content)).toEqual(["Visible"]);
    expect(
      (await ctx.request("POST", "/comments", { content: "No" })).status,
    ).toBe(403);
    expect(
      (await ctx.request("PATCH", `/comments/${comment.id}`, { content: "No" }))
        .status,
    ).toBe(403);
    expect(
      (await ctx.request("DELETE", `/comments/${comment.id}`)).status,
    ).toBe(403);
  });

  it("hides a thread from another workspace", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession((await createWorkspaceMember()).user);
    expect((await ctx.request("GET", "/comments")).status).toBe(404);
    expect(
      (await ctx.request("POST", "/comments", { content: "Hi" })).status,
    ).toBe(404);
  });

  it("doesn't reach a comment through another test case", async () => {
    const ctx = await createCommentFixture();
    mockAuthenticatedSession(ctx.author.user);
    const comment = (await (
      await ctx.request("POST", "/comments", { content: "Here" })
    ).json()) as Comment;
    const [other] = await db
      .insert(schema.testCaseTable)
      .values({ projectId: ctx.project.id, title: "Other" })
      .returning();
    const path = `/api/test-case/${other!.id}/comments/${comment.id}`;
    expect((await ctx.app.request(path, { method: "DELETE" })).status).toBe(
      404,
    );
    expect(await list(ctx)).toHaveLength(1);
  });

  it("deletes the comments with their test case and keeps one whose author is gone", async () => {
    const ctx = await createCommentFixture("admin");
    const teammate = await addMember(ctx.author.workspace.id);
    mockAuthenticatedSession(teammate);
    await ctx.request("POST", "/comments", { content: "From a teammate" });

    await db
      .delete(schema.userTable)
      .where(eq(schema.userTable.id, teammate.id));
    mockAuthenticatedSession(ctx.author.user);
    expect(await list(ctx)).toMatchObject([
      { content: "From a teammate", author: null },
    ]);

    expect((await ctx.request("DELETE")).status).toBe(200);
    expect(await db.select().from(schema.testCaseCommentTable)).toHaveLength(0);
  });
});
