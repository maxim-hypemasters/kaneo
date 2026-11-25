import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
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
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

// A document with one thread and one reply by the owner, then requests made
// as a second person whose role is `role`, defined by `permission` when it is
// custom.
async function setup(
  kind: CommentKind,
  role: string,
  permission?: Record<string, string[]>,
) {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
  });
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    slug: "CP",
  });
  mockAuthenticatedSession(owner);
  const documents = await commentDocuments(kind, project.id);
  const thread = await documents.start("Owner's remark");
  const reply = (
    (await (
      await documents.comments(`/${thread.id}/replies`, "POST", {
        content: "Owner's reply",
      })
    ).json()) as Thread
  ).replies[0]!;
  if (permission)
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: workspace.id,
      role,
      permission: JSON.stringify(permission),
    });
  const person = await addWorkspaceMember(workspace.id, role);
  mockAuthenticatedSession(person);
  return { ...documents, owner, person, workspace, project, thread, reply };
}

// Every comment write, as [method, path under /comments, body].
const writes = (threadId: string, replyId: string) =>
  [
    ["POST", "", { content: "New", anchor: anchor("quoted text") }],
    ["POST", `/${threadId}/replies`, { content: "Reply" }],
    ["PUT", `/${threadId}`, { content: "Edited" }],
    ["PUT", `/${threadId}/resolution`, { resolved: true }],
    ["DELETE", `/${replyId}`, undefined],
    ["DELETE", `/${threadId}`, undefined],
  ] as const;

async function statuses(ctx: Awaited<ReturnType<typeof setup>>) {
  const out: number[] = [];
  for (const [method, path, body] of writes(ctx.thread.id, ctx.reply.id))
    out.push((await ctx.comments(path, method, body)).status);
  return out;
}

describe.each(commentKinds)("comment permissions on a %s document", (kind) => {
  it("lets a read-only role read threads but change nothing", async () => {
    const ctx = await setup(kind, "viewer");
    const listed = await ctx.comments();
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([
      { ...ctx.thread, replies: [ctx.reply] },
    ]);
    expect(await statuses(ctx)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(await ctx.list()).toEqual([{ ...ctx.thread, replies: [ctx.reply] }]);
  });

  it("needs the document's own update permission to comment", async () => {
    const own = kind === "page" ? "document" : "feature";
    const other = kind === "page" ? "feature" : "document";
    const ctx = await setup(kind, "creator", {
      project: ["read"],
      [own]: ["create", "read", "delete"],
      [other]: ["create", "read", "update", "delete"],
    });
    expect((await ctx.comments()).status).toBe(200);
    expect(await statuses(ctx)).toEqual([403, 403, 403, 403, 403, 403]);
  });

  it("hides threads from a role that cannot read the document", async () => {
    const other = kind === "page" ? "feature" : "document";
    const ctx = await setup(kind, "elsewhere", {
      project: ["read"],
      task: ["create", "read", "update", "delete"],
      [other]: ["create", "read", "update", "delete"],
    });
    const listed = await ctx.comments();
    expect(listed.status).toBe(403);
    expect(JSON.stringify(await listed.json())).not.toContain("Owner");
    expect(await statuses(ctx)).toEqual([403, 403, 403, 403, 403, 403]);
  });

  it("lets a member comment and resolve, but not change other people's comments", async () => {
    const ctx = await setup(kind, "member");
    // New thread, reply, edit the owner's, resolve, delete the owner's.
    expect(await statuses(ctx)).toEqual([200, 200, 403, 200, 403, 403]);
  });

  it("refuses a member restricted to other projects", async () => {
    const ctx = await setup(kind, "member");
    const { project: allowed } = await createProjectFixture({
      workspaceId: ctx.workspace.id,
      slug: "OK",
    });
    await restrictToProjects(ctx.workspace.id, ctx.person.id, [allowed.id]);
    const listed = await ctx.comments();
    expect(listed.status).toBe(403);
    expect(JSON.stringify(await listed.json())).not.toContain("Owner");
    expect(await statuses(ctx)).toEqual([403, 403, 403, 403, 403, 403]);

    await restrictToProjects(ctx.workspace.id, ctx.person.id, [
      allowed.id,
      ctx.project.id,
    ]);
    expect((await ctx.comments()).status).toBe(200);
  });

  it("hides the document from people outside the workspace", async () => {
    const ctx = await setup(kind, "member");
    const outsider = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(outsider.user);
    const listed = await ctx.comments();
    expect(listed.status).toBe(404);
    expect(JSON.stringify(await listed.json())).not.toContain("Owner");
    expect(await statuses(ctx)).toEqual([404, 404, 404, 404, 404, 404]);
    mockAuthenticatedSession(ctx.owner);
    expect(await ctx.list()).toEqual([{ ...ctx.thread, replies: [ctx.reply] }]);
  });
});

describe("Feature document comment paths", () => {
  it("reach a document only through its own Feature", async () => {
    const ctx = await setup("feature", "member");
    const otherFeature = await insertTask(ctx.project.id, {
      type: "feature",
      title: "Other",
    });
    const task = await insertTask(ctx.project.id);
    for (const id of [otherFeature.id, task.id]) {
      const base = `/feature/${id}/documents/${ctx.documentId}/comments`;
      expect((await ctx.request(base)).status).toBe(404);
      expect(
        (
          await ctx.request(base, "POST", {
            content: "Sideways",
            anchor: anchor("q"),
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await ctx.request(`${base}/${ctx.thread.id}/replies`, "POST", {
            content: "Sideways",
          })
        ).status,
      ).toBe(404);
    }
    expect((await ctx.list())[0]!.replies).toEqual([ctx.reply]);
  });
});

describe("comments on an expired plan", () => {
  const CLOUD_ENV = {
    KANEO_CLOUD: "true",
    CREEM_API_KEY: "creem_test_dummy",
    CREEM_WEBHOOK_SECRET: "whsec_dummy",
  };
  const saved: Record<string, string | undefined> = {};
  afterEach(() => {
    for (const key of Object.keys(CLOUD_ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it.each(commentKinds)(
    "stay readable but refuse every write with 402 on a %s document",
    async (kind) => {
      const ctx = await setup(kind, "member");
      mockAuthenticatedSession(ctx.owner);
      // Billing is switched on only now, after the fixture's own comments.
      for (const [key, value] of Object.entries(CLOUD_ENV)) {
        saved[key] = process.env[key];
        process.env[key] = value;
      }
      await db.insert(schema.workspaceBillingTable).values({
        workspaceId: ctx.workspace.id,
        foundingFree: false,
        trialEndsAt: new Date(Date.now() - 60_000),
      });
      expect(await statuses(ctx)).toEqual([402, 402, 402, 402, 402, 402]);
      expect(await ctx.list()).toEqual([
        { ...ctx.thread, replies: [ctx.reply] },
      ]);
    },
  );
});
