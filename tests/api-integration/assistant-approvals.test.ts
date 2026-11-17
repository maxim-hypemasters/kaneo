import { and, asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { sealAssistantKey } from "../../apps/api/src/assistant/settings/assistant-key-box";
import type { AssistantStreamEvent } from "../../apps/api/src/assistant/stream-events";
import {
  decideApprovalsAs,
  REJECTED_BY_USER,
} from "../../apps/api/src/assistant/turn/decide-approvals";
import {
  APPROVED_OUTCOME_UNKNOWN,
  CHANGED_SINCE,
} from "../../apps/api/src/assistant/proposals/execute-approved";
import { ARCHIVED_TASK } from "../../apps/api/src/assistant/proposals/archived-task";
import { TRIAGE_NOTE } from "../../apps/api/src/assistant/proposals/triage-fields";
import { TRIAGE_TASK } from "../../apps/api/src/assistant/proposals/triage-task";
import { SKIPPED_BY_NEW_MESSAGE } from "../../apps/api/src/assistant/turn/send-message";
import db, { schema } from "../../apps/api/src/database";
import {
  assistantChatTable,
  assistantMessageTable,
  workspaceAssistantSettingTable,
} from "../../apps/api/src/database/schema";
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import {
  type ChatRequestBody,
  chatReply,
  type FakeOpenRouter,
  installFakeOpenRouter,
} from "./helpers/assistant/fake-openrouter";
import { mockSessionsByToken } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { createTaskFixture } from "./helpers/project-access/create-task-fixture";

const KEY = "sk-or-v1-approvals-integration-0123456789abcdef-SECRET4";
const MODEL = "anthropic/claude-sonnet-5.5";
const WRITE_TOOLS = [
  "create_task",
  "update_task",
  "update_task_status",
  "create_project_page",
  "update_project_page",
  "create_label",
  "create_milestone",
];

type User = typeof schema.userTable.$inferSelect;
type ToolCall = { id: string; name: string; arguments: unknown };

let openRouter: FakeOpenRouter | null = null;
// Every response body the browser could see, checked for the key.
let bodies: string[] = [];
// task.created events, as the realtime layer receives them.
const created: { taskId: string; initiatorId?: string }[] = [];
let subscribed = false;

beforeEach(async () => {
  await resetTestDatabase();
  bodies = [];
  created.length = 0;
  if (!subscribed) {
    subscribed = true;
    await subscribeToEvent<{ taskId: string; initiatorId?: string }>(
      "task.created",
      async (data) => {
        created.push(data);
      },
    );
  }
});

afterEach(() => {
  const fake = openRouter;
  openRouter = null;
  fake?.restore();
  for (const body of bodies) expect(body).not.toContain(KEY);
  for (const request of fake?.loopbackRequests ?? []) {
    expect([...request.headers.values()].join("\n")).not.toContain(KEY);
    expect(request.body ?? "").not.toContain(KEY);
  }
  for (const body of fake?.chatRequestBodies() ?? []) {
    expect(JSON.stringify(body)).not.toContain(KEY);
  }
});

function parseEvents(text: string): AssistantStreamEvent[] {
  return text
    .split("\n\n")
    .filter((record) => record.startsWith("data: "))
    .map((record) => JSON.parse(record.slice("data: ".length)));
}

const messagesOf = (events: AssistantStreamEvent[]) =>
  events.flatMap((event) => (event.type === "message" ? [event.message] : []));

/** Every tool call is answered by exactly one tool message, in order. */
function expectValidHistory(history: ChatRequestBody["messages"]) {
  expect(history[0]?.role).toBe("system");
  expect(history.at(-1)?.role).not.toBe("assistant");
  for (const [index, message] of history.entries()) {
    const calls = message.tool_calls ?? [];
    const answers = history.slice(index + 1, index + 1 + calls.length);
    expect(answers.map((answer) => [answer.role, answer.tool_call_id])).toEqual(
      calls.map((call) => ["tool", call.id]),
    );
  }
  const answered = history.filter((m) => m.role === "tool").length;
  const asked = history.reduce((n, m) => n + (m.tool_calls?.length ?? 0), 0);
  expect(answered).toBe(asked);
}

async function setup() {
  const { user: owner, workspace } = await createWorkspaceMember({
    role: "owner",
    workspaceName: "Acme",
  });
  const mobile = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Mobile",
    slug: "mob",
  });
  const member = await addWorkspaceMember(workspace.id, "member");
  const admin = await addWorkspaceMember(workspace.id, "admin");
  const viewer = await addWorkspaceMember(workspace.id, "viewer");

  await db.insert(workspaceAssistantSettingTable).values({
    workspaceId: workspace.id,
    apiKeyCiphertext: sealAssistantKey(workspace.id, KEY),
    apiKeyHint: `…${KEY.slice(-4)}`,
    model: MODEL,
  });

  mockSessionsByToken([owner, member, admin, viewer]);
  const { app } = createApp();
  const fake = installFakeOpenRouter({ app });
  openRouter = fake;

  const send = (user: User, method: string, path: string, body?: unknown) =>
    app.request(`/api/assistant/${workspace.id}${path}`, {
      method,
      headers: {
        authorization: `Bearer token-${user.id}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  /** A turn request read to its end. */
  const turn = async (user: User, path: string, body: unknown) => {
    const response = await send(user, "POST", path, body);
    expect(response.status).toBe(200);
    const text = await response.text();
    bodies.push(text);
    const events = parseEvents(text);
    const chat = events.find((event) => event.type === "chat");
    return {
      events,
      chatId: chat?.type === "chat" ? chat.chat.id : "",
      tools: messagesOf(events).filter((m) => m.role === "tool"),
      last: events.at(-1),
    };
  };

  /** A new chat whose first step makes `calls`. */
  const propose = async (user: User, ...calls: ToolCall[]) => {
    fake.queueChatResponses(chatReply({ toolCalls: calls }));
    return turn(user, "/chats", { content: "Please make the change" });
  };

  const decide = async (
    user: User,
    chatId: string,
    decisions: { messageId: string; approve: boolean }[],
  ) => {
    const response = await send(user, "POST", `/chats/${chatId}/decisions`, {
      decisions,
    });
    const text = await response.clone().text();
    bodies.push(text);
    return response;
  };

  const decideOk = async (
    user: User,
    chatId: string,
    decisions: { messageId: string; approve: boolean }[],
  ) => {
    const response = await decide(user, chatId, decisions);
    expect(response.status).toBe(200);
    return response.json();
  };

  const toolRows = (chatId: string) =>
    db
      .select()
      .from(assistantMessageTable)
      .where(
        and(
          eq(assistantMessageTable.chatId, chatId),
          eq(assistantMessageTable.role, "tool"),
        ),
      )
      .orderBy(asc(assistantMessageTable.seq));

  const tasks = () =>
    db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, mobile.project.id))
      .orderBy(asc(schema.taskTable.createdAt));

  const writes = () =>
    fake.loopbackRequests.filter((request) => request.method !== "GET");

  return {
    owner,
    member,
    admin,
    viewer,
    workspace,
    mobile,
    fake,
    send,
    turn,
    propose,
    decide,
    decideOk,
    toolRows,
    tasks,
    writes,
  };
}

const createTaskCall = (projectId: string, title = "Fix login crash") => ({
  id: "call_create",
  name: "create_task",
  arguments: { projectId, title, description: "Crashes on submit" },
});

describe("assistant write approvals", () => {
  it("proposes a task, creates it once on approval as the user, and continues", async () => {
    const ctx = await setup();
    const { member, mobile, fake } = ctx;

    const proposal = await ctx.propose(
      member,
      createTaskCall(mobile.project.id),
    );
    expect(proposal.last).toEqual({ type: "done", pendingCount: 1 });
    const [card] = proposal.tools;
    expect(card).toMatchObject({
      toolName: "create_task",
      approval: "pending",
      isError: false,
      errorText: null,
      preview: {
        target: "Mobile",
        targetKey: "projectId",
        fields: [
          { key: "projectId", kind: "ref", value: "Mobile" },
          { key: "title", kind: "text", value: "Fix login crash" },
          { key: "description", kind: "markdown", value: "Crashes on submit" },
        ],
        diff: null,
        nested: null,
      },
    });
    // Nothing was written, and the model was offered writes.
    expect(ctx.writes()).toEqual([]);
    expect(await ctx.tasks()).toEqual([]);
    const [ask] = fake.chatRequestBodies();
    expect(ask?.tools?.map((tool) => tool.function.name)).toContain(
      "create_task",
    );
    expect(ask?.messages[0]?.content).toContain('"canWrite": true');

    // Continue waits for the decision.
    const early = await ctx.send(
      member,
      "POST",
      `/chats/${proposal.chatId}/continue`,
      {},
    );
    expect(early.status).toBe(409);
    expect(await readErrorBody(early)).toMatchObject({
      code: "ASSISTANT_PENDING_APPROVALS",
    });

    // An approval that runs is activity: the chat moves up the history.
    const hourAgo = new Date(Date.now() - 3_600_000);
    await db
      .update(assistantChatTable)
      .set({ updatedAt: hourAgo })
      .where(eq(assistantChatTable.id, proposal.chatId));
    const result = await ctx.decideOk(member, proposal.chatId, [
      { messageId: card!.id, approve: true },
    ]);
    const [chat] = await db
      .select({ updatedAt: assistantChatTable.updatedAt })
      .from(assistantChatTable)
      .where(eq(assistantChatTable.id, proposal.chatId));
    expect(chat!.updatedAt.getTime()).toBeGreaterThan(hourAgo.getTime());
    expect(result).toMatchObject({ pendingCount: 0, resumable: true });
    expect(result.messages).toEqual([
      expect.objectContaining({
        id: card!.id,
        approval: "approved",
        isError: false,
        resultSummary: {
          label: "Created MOB-1 Fix login crash",
          href: `/${ctx.workspace.slug}/task/MOB-1`,
        },
      }),
    ]);

    const [task, ...others] = await ctx.tasks();
    expect(others).toEqual([]);
    expect(task).toMatchObject({ title: "Fix login crash", number: 1 });
    // It ran over loopback as the member, pinned to the workspace.
    const [write] = ctx.writes();
    expect(write?.method).toBe("POST");
    expect(write?.headers.get("authorization")).toBe(
      `Bearer token-${member.id}`,
    );
    expect(write?.headers.get("x-kaneo-assistant-workspace")).toBe(
      ctx.workspace.id,
    );
    expect(created).toEqual([
      expect.objectContaining({ taskId: task!.id, initiatorId: member.id }),
    ]);

    const [row] = await ctx.toolRows(proposal.chatId);
    expect(row).toMatchObject({
      approval: "approved",
      decidedAt: expect.any(Date),
    });
    expect(row?.content).toContain(task!.id);
    expect(row?.content).not.toBe(APPROVED_OUTCOME_UNKNOWN);

    // Continue sends a history where every call has its answer.
    fake.queueChatResponses(chatReply({ text: ["Created MOB-1."] }));
    const resumed = await ctx.turn(
      member,
      `/chats/${proposal.chatId}/continue`,
      {},
    );
    expect(resumed.last).toEqual({ type: "done", pendingCount: 0 });
    const history = fake.chatRequestBodies().at(-1)!.messages;
    expectValidHistory(history);
    expect(history.at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "call_create",
    });
    expect(history.at(-1)?.content).toContain(task!.id);
  });

  it("runs an approval once, even when approved twice at the same time", async () => {
    const ctx = await setup();
    const { member, mobile } = ctx;
    const proposal = await ctx.propose(
      member,
      createTaskCall(mobile.project.id),
    );
    const decision = [{ messageId: proposal.tools[0]!.id, approve: true }];

    const responses = await Promise.all([
      ctx.decide(member, proposal.chatId, decision),
      ctx.decide(member, proposal.chatId, decision),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const refused = responses.find((r) => r.status === 409)!;
    expect(["ASSISTANT_CHAT_BUSY", "ASSISTANT_NOTHING_PENDING"]).toContain(
      (await readErrorBody(refused)).code,
    );

    const again = await ctx.decide(member, proposal.chatId, decision);
    expect(again.status).toBe(409);
    expect(await readErrorBody(again)).toMatchObject({
      code: "ASSISTANT_NOTHING_PENDING",
    });
    expect(await ctx.tasks()).toHaveLength(1);
    expect(created).toHaveLength(1);
  });

  it("rejects without writing and tells the model on Continue", async () => {
    const ctx = await setup();
    const { member, mobile, fake } = ctx;
    const proposal = await ctx.propose(
      member,
      createTaskCall(mobile.project.id),
    );

    const result = await ctx.decideOk(member, proposal.chatId, [
      { messageId: proposal.tools[0]!.id, approve: false },
    ]);
    expect(result).toMatchObject({ pendingCount: 0, resumable: true });
    expect(result.messages).toEqual([
      expect.objectContaining({ approval: "rejected", isError: false }),
    ]);
    expect(ctx.writes()).toEqual([]);
    expect(await ctx.tasks()).toEqual([]);

    fake.queueChatResponses(chatReply({ text: ["Okay, I won't."] }));
    await ctx.turn(member, `/chats/${proposal.chatId}/continue`, {});
    const history = fake.chatRequestBodies().at(-1)!.messages;
    expectValidHistory(history);
    expect(history.at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "call_create",
      content: REJECTED_BY_USER,
    });
  });

  it("ignores messages of other chats and skips pending cards on a new message", async () => {
    const ctx = await setup();
    const { member, mobile } = ctx;
    const first = await ctx.propose(member, createTaskCall(mobile.project.id));
    const second = await ctx.propose(
      member,
      createTaskCall(mobile.project.id, "Another"),
    );

    // A card of the first chat, decided through the second: nothing pending.
    const crossed = await ctx.decide(member, second.chatId, [
      { messageId: first.tools[0]!.id, approve: true },
    ]);
    expect(crossed.status).toBe(409);
    expect(await readErrorBody(crossed)).toMatchObject({
      code: "ASSISTANT_NOTHING_PENDING",
    });

    ctx.fake.queueChatResponses(chatReply({ text: ["Left it."] }));
    const next = await ctx.turn(member, `/chats/${first.chatId}/messages`, {
      content: "Never mind",
    });
    expect(messagesOf(next.events)[0]).toMatchObject({
      id: first.tools[0]!.id,
      approval: "skipped",
    });
    const [row] = await ctx.toolRows(first.chatId);
    expect(row).toMatchObject({
      approval: "skipped",
      content: SKIPPED_BY_NEW_MESSAGE,
    });
    expect(await ctx.tasks()).toEqual([]);
  });

  it("offers a viewer no write tools", async () => {
    const ctx = await setup();
    ctx.fake.queueChatResponses(chatReply({ text: ["I can only read."] }));
    await ctx.turn(ctx.viewer, "/chats", { content: "Create a task" });
    const [ask] = ctx.fake.chatRequestBodies();
    const offered = (ask?.tools ?? []).map((tool) => tool.function.name);
    expect(offered).toContain("get_task");
    for (const name of WRITE_TOOLS) expect(offered).not.toContain(name);
    expect(ask?.messages[0]?.content).toContain('"canWrite": false');
  });

  it("runs an approval with the approver's current permissions", async () => {
    const ctx = await setup();
    const { admin, mobile, workspace } = ctx;
    const proposal = await ctx.propose(
      admin,
      createTaskCall(mobile.project.id),
    );
    expect(proposal.last).toEqual({ type: "done", pendingCount: 1 });

    await db
      .update(schema.workspaceUserTable)
      .set({ role: "viewer" })
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, workspace.id),
          eq(schema.workspaceUserTable.userId, admin.id),
        ),
      );

    const result = await ctx.decideOk(admin, proposal.chatId, [
      { messageId: proposal.tools[0]!.id, approve: true },
    ]);
    expect(result.messages).toEqual([
      expect.objectContaining({
        approval: "approved",
        isError: true,
        resultSummary: null,
        errorText: expect.stringMatching(/permission/i),
      }),
    ]);
    expect(ctx.writes()).toHaveLength(1);
    expect(await ctx.tasks()).toEqual([]);
  });

  it("rewrites a page only after a full read, keeping its uploads", async () => {
    const ctx = await setup();
    const { owner, mobile, workspace, fake } = ctx;
    const [page] = await db
      .insert(schema.projectDocumentTable)
      .values({
        projectId: mobile.project.id,
        title: "Handbook",
        body: "",
        createdBy: owner.id,
      })
      .returning();
    const [asset] = await db
      .insert(schema.assetTable)
      .values({
        workspaceId: workspace.id,
        projectId: mobile.project.id,
        documentId: page!.id,
        createdBy: owner.id,
        surface: "document",
        objectKey: "handbook-diagram",
        filename: "diagram.png",
        mimeType: "image/png",
        size: 10,
      })
      .returning();
    const oldBody = `# Handbook\n\n![diagram](/api/asset/${asset!.id})`;
    await db
      .update(schema.projectDocumentTable)
      .set({ body: oldBody })
      .where(eq(schema.projectDocumentTable.id, page!.id));
    const rewrite = (id: string) => ({
      id,
      name: "update_project_page",
      arguments: { pageId: page!.id, body: "# Handbook\n\nRewritten." },
    });

    fake.queueChatResponses(
      chatReply({ toolCalls: [rewrite("call_blind")] }),
      chatReply({
        toolCalls: [
          {
            id: "call_read",
            name: "get_project_page",
            arguments: { pageId: page!.id },
          },
        ],
      }),
      chatReply({ toolCalls: [rewrite("call_rewrite")] }),
    );
    const proposal = await ctx.turn(owner, "/chats", {
      content: "Rewrite the handbook",
    });
    expect(proposal.last).toEqual({ type: "done", pendingCount: 1 });
    const [blind, read, card] = proposal.tools;
    expect(blind).toMatchObject({ isError: true, approval: null });
    expect(blind?.errorText).toContain(
      "Read the full current text with get_project_page first, or use appendMarkdown",
    );
    expect(read).toMatchObject({ isError: false, approval: null });
    expect(card).toMatchObject({
      approval: "pending",
      preview: {
        target: "Handbook",
        diff: { before: oldBody, after: "# Handbook\n\nRewritten." },
      },
    });
    expect(ctx.writes()).toEqual([]);

    const result = await ctx.decideOk(owner, proposal.chatId, [
      { messageId: card!.id, approve: true },
    ]);
    expect(result.messages[0]).toMatchObject({
      approval: "approved",
      isError: false,
      resultSummary: {
        label: "Updated page Handbook",
        href: `/dashboard/workspace/${workspace.id}/project/${mobile.project.id}?tab=documents&documentId=${page!.id}`,
      },
    });
    const [write] = ctx.writes();
    expect(write?.method).toBe("PUT");
    expect(JSON.parse(write?.body ?? "{}")).toEqual({
      body: "# Handbook\n\nRewritten.",
      expectedRevision: 1,
      keepRemovedAssets: true,
    });
    const [saved] = await db
      .select()
      .from(schema.projectDocumentTable)
      .where(eq(schema.projectDocumentTable.id, page!.id));
    expect(saved).toMatchObject({
      body: "# Handbook\n\nRewritten.",
      revision: 2,
    });
    expect(
      await db
        .select()
        .from(schema.assetTable)
        .where(eq(schema.assetTable.id, asset!.id)),
    ).toHaveLength(1);
  });

  it("fails a page rewrite whose page changed after the proposal", async () => {
    const ctx = await setup();
    const { owner, mobile, fake } = ctx;
    const [page] = await db
      .insert(schema.projectDocumentTable)
      .values({ projectId: mobile.project.id, title: "Notes", body: "v1" })
      .returning();
    fake.queueChatResponses(
      chatReply({
        toolCalls: [
          {
            id: "call_read",
            name: "get_project_page",
            arguments: { pageId: page!.id },
          },
        ],
      }),
      chatReply({
        toolCalls: [
          {
            id: "call_rewrite",
            name: "update_project_page",
            arguments: { pageId: page!.id, body: "v2 from the assistant" },
          },
        ],
      }),
    );
    const proposal = await ctx.turn(owner, "/chats", { content: "Rewrite" });
    const card = proposal.tools.at(-1)!;
    expect(card.approval).toBe("pending");

    await db
      .update(schema.projectDocumentTable)
      .set({ body: "v2 by a teammate", revision: 2 })
      .where(eq(schema.projectDocumentTable.id, page!.id));

    const result = await ctx.decideOk(owner, proposal.chatId, [
      { messageId: card.id, approve: true },
    ]);
    expect(result.messages[0]).toMatchObject({
      approval: "approved",
      isError: true,
      resultSummary: null,
      errorText: expect.stringContaining(
        "The document changed since editing began",
      ),
    });
    expect(JSON.parse(ctx.writes()[0]?.body ?? "{}")).toMatchObject({
      expectedRevision: 1,
    });
    const [saved] = await db
      .select()
      .from(schema.projectDocumentTable)
      .where(eq(schema.projectDocumentTable.id, page!.id));
    expect(saved).toMatchObject({ body: "v2 by a teammate", revision: 2 });
  });

  /** A task whose description holds an upload, and a chat that read it in full and proposes `next`. */
  async function proposeDescriptionRewrite(
    ctx: Awaited<ReturnType<typeof setup>>,
    next: string,
  ) {
    const { owner, mobile, workspace, fake } = ctx;
    const task = (await createTaskFixture(mobile, "Fix login", owner.id))!;
    const [asset] = await db
      .insert(schema.assetTable)
      .values({
        workspaceId: workspace.id,
        projectId: mobile.project.id,
        taskId: task.id,
        createdBy: owner.id,
        surface: "description",
        objectKey: "login-screenshot",
        filename: "screenshot.png",
        mimeType: "image/png",
        size: 10,
      })
      .returning();
    const before = `Steps\n\n![screenshot](/api/asset/${asset!.id})`;
    await db
      .update(schema.taskTable)
      .set({ description: before })
      .where(eq(schema.taskTable.id, task.id));

    fake.queueChatResponses(
      chatReply({
        toolCalls: [
          {
            id: "call_read",
            name: "get_task_description",
            arguments: { taskId: task.id },
          },
        ],
      }),
      chatReply({
        toolCalls: [
          {
            id: "call_rewrite",
            name: "update_task_description",
            arguments: { taskId: task.id, description: next },
          },
        ],
      }),
    );
    const proposal = await ctx.turn(owner, "/chats", {
      content: "Rewrite the steps",
    });
    expect(proposal.last).toEqual({ type: "done", pendingCount: 1 });
    const [read, card] = proposal.tools;
    expect(read).toMatchObject({ isError: false, approval: null });
    expect(card).toMatchObject({
      toolName: "update_task_description",
      approval: "pending",
      preview: {
        target: "MOB-1 Fix login",
        targetKey: "taskId",
        fields: [{ key: "taskId", kind: "ref", value: "MOB-1 Fix login" }],
        diff: { before, after: next },
      },
    });
    expect(ctx.writes()).toEqual([]);
    return {
      task,
      asset: asset!,
      before,
      card: card!,
      chatId: proposal.chatId,
    };
  }

  const descriptionOf = async (taskId: string) =>
    (
      await db
        .select({ description: schema.taskTable.description })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, taskId))
    )[0]?.description;

  it("rewrites a task description after a full read, keeping its uploads", async () => {
    const ctx = await setup();
    const next = "Steps:\n1. Open the app\n2. Sign in";
    const { task, asset, before, card, chatId } =
      await proposeDescriptionRewrite(ctx, next);
    // The model is never asked for the expectation the proposal sets.
    const offered = ctx.fake
      .chatRequestBodies()[0]
      ?.tools?.find(
        (tool) => tool.function.name === "update_task_description",
      ) as { function: { parameters: { properties: object } } } | undefined;
    expect(offered?.function.parameters.properties).not.toHaveProperty(
      "expectedDescription",
    );

    const result = await ctx.decideOk(ctx.owner, chatId, [
      { messageId: card.id, approve: true },
    ]);
    expect(result.messages[0]).toMatchObject({
      approval: "approved",
      isError: false,
      resultSummary: {
        label: "Updated MOB-1 Fix login",
        href: `/${ctx.workspace.slug}/task/MOB-1`,
      },
    });
    const [write, ...others] = ctx.writes();
    expect(others).toEqual([]);
    expect(write?.method).toBe("PUT");
    expect(write?.path).toBe(`/api/task/description/${task.id}`);
    expect(JSON.parse(write?.body ?? "{}")).toEqual({
      description: next,
      expectedDescription: before,
      keepRemovedAssets: true,
    });
    expect(await descriptionOf(task.id)).toBe(next);
    expect(
      await db
        .select()
        .from(schema.assetTable)
        .where(eq(schema.assetTable.id, asset.id)),
    ).toHaveLength(1);
  });

  it("fails a description rewrite when a teammate edited it since", async () => {
    const ctx = await setup();
    const { task, before, card, chatId } = await proposeDescriptionRewrite(
      ctx,
      "Rewritten by the assistant",
    );
    await db
      .update(schema.taskTable)
      .set({ description: "Steps a teammate wrote" })
      .where(eq(schema.taskTable.id, task.id));

    const result = await ctx.decideOk(ctx.owner, chatId, [
      { messageId: card.id, approve: true },
    ]);
    expect(result.messages[0]).toMatchObject({
      approval: "approved",
      isError: true,
      resultSummary: null,
      errorText: expect.stringContaining(
        "The description changed since editing began",
      ),
    });
    expect(JSON.parse(ctx.writes()[0]?.body ?? "{}")).toMatchObject({
      expectedDescription: before,
    });
    expect(await descriptionOf(task.id)).toBe("Steps a teammate wrote");
    const [, row] = await ctx.toolRows(chatId);
    expect(row).toMatchObject({ approval: "approved", isError: true });
    expect(row?.content).toContain(
      "The description changed since editing began",
    );
  });

  it("writes nothing when previewed project details changed since the proposal", async () => {
    const ctx = await setup();
    const { owner, mobile } = ctx;
    const proposal = await ctx.propose(owner, {
      id: "call_details",
      name: "update_project_details",
      arguments: { projectId: mobile.project.id, description: "Native apps" },
    });
    const card = proposal.tools[0]!;
    expect(card).toMatchObject({
      approval: "pending",
      preview: {
        target: "Mobile",
        fields: [
          { key: "projectId", kind: "ref", value: "Mobile" },
          {
            key: "description",
            kind: "markdown",
            value: "Native apps",
            from: null,
          },
        ],
      },
    });

    await db
      .update(schema.projectTable)
      .set({ description: "Edited elsewhere" })
      .where(eq(schema.projectTable.id, mobile.project.id));

    const result = await ctx.decideOk(owner, proposal.chatId, [
      { messageId: card.id, approve: true },
    ]);
    expect(result.messages[0]).toMatchObject({
      approval: "approved",
      isError: true,
      errorText: CHANGED_SINCE,
    });
    expect(ctx.writes()).toEqual([]);
    const [project] = await db
      .select()
      .from(schema.projectTable)
      .where(eq(schema.projectTable.id, mobile.project.id));
    expect(project?.description).toBe("Edited elsewhere");
  });

  it("refuses to archive or unarchive a task", async () => {
    const ctx = await setup();
    const { owner, mobile } = ctx;
    const active = await createTaskFixture(mobile, "Active task", owner.id);
    const [archived] = await db
      .insert(schema.taskTable)
      .values({
        projectId: mobile.project.id,
        title: "Archived task",
        status: "archived",
        userId: owner.id,
        number: 2,
      })
      .returning();

    ctx.fake.queueChatResponses(
      chatReply({
        toolCalls: [
          {
            id: "call_archive",
            name: "update_task_status",
            arguments: { taskId: active!.id, status: "archived" },
          },
          {
            id: "call_unarchive",
            name: "update_task_status",
            arguments: { taskId: archived!.id, status: "to-do" },
          },
        ],
      }),
      chatReply({ text: ["I can't change archived work."] }),
    );
    const proposal = await ctx.turn(owner, "/chats", { content: "Tidy up" });
    expect(proposal.last).toEqual({ type: "done", pendingCount: 0 });
    expect(proposal.tools.map((tool) => [tool.isError, tool.approval])).toEqual(
      [
        [true, null],
        [true, null],
      ],
    );
    expect(proposal.tools[0]?.errorText).toContain("can't archive work");
    expect(proposal.tools[1]?.errorText).toBe(ARCHIVED_TASK);
    expect(ctx.writes()).toEqual([]);
  });

  it("shows new work from outside triage in Triage and creates it there", async () => {
    const ctx = await setup();
    const { owner, member, mobile } = ctx;
    // The owner triages Mobile; the member's new work waits for them.
    await db.insert(schema.projectTriageMemberTable).values({
      workspaceId: ctx.workspace.id,
      projectId: mobile.project.id,
      userId: owner.id,
    });

    const proposal = await ctx.propose(member, {
      id: "call_create",
      name: "create_task",
      arguments: {
        projectId: mobile.project.id,
        title: "Export fails",
        description: "",
        status: "in-progress",
        type: "bug",
      },
    });
    const card = proposal.tools[0]!;
    expect(card.approval).toBe("pending");
    expect(card.preview?.fields).toEqual([
      { key: "projectId", kind: "ref", value: "Mobile" },
      { key: "title", kind: "text", value: "Export fails" },
      { key: "description", kind: "markdown", value: "" },
      { key: "status", kind: "text", value: "triage", from: "in-progress" },
      { key: "type", kind: "text", value: "bug" },
      { key: "triage", kind: "text", value: TRIAGE_NOTE },
    ]);

    const result = await ctx.decideOk(member, proposal.chatId, [
      { messageId: card.id, approve: true },
    ]);
    expect(result.messages[0]).toMatchObject({
      approval: "approved",
      isError: false,
    });
    const [task, ...others] = await ctx.tasks();
    expect(others).toEqual([]);
    expect(task).toMatchObject({
      title: "Export fails",
      type: "bug",
      status: "triage",
    });

    // Only a triage member can take it out of Triage, in the Triage view.
    const writes = ctx.writes().length;
    const move = await ctx.propose(member, {
      id: "call_move",
      name: "update_task_status",
      arguments: { taskId: task!.id, status: "in-progress" },
    });
    expect(move.tools[0]).toMatchObject({
      isError: true,
      approval: null,
      errorText: TRIAGE_TASK,
    });
    expect(ctx.writes()).toHaveLength(writes);

    // The owner is a triage member: their card keeps the status asked for.
    const own = await ctx.propose(owner, {
      id: "call_own",
      name: "create_task",
      arguments: {
        projectId: mobile.project.id,
        title: "Own work",
        description: "",
        status: "in-progress",
      },
    });
    expect(own.tools[0]?.preview?.fields).toContainEqual({
      key: "status",
      kind: "text",
      value: "in-progress",
    });
    expect(
      own.tools[0]?.preview?.fields.some((field) => field.key === "triage"),
    ).toBe(false);
  });

  it("shows a new Feature's nested work and creates it atomically", async () => {
    const ctx = await setup();
    const { member, mobile } = ctx;
    const proposal = await ctx.propose(member, {
      id: "call_feature",
      name: "create_task",
      arguments: {
        projectId: mobile.project.id,
        title: "Payments",
        description: "Take card payments",
        type: "feature",
        featureComposition: {
          milestones: [{ key: "design", title: "Design" }],
          newTasks: [
            { title: "Card form", milestoneKey: "design" },
            { title: "Receipts", type: "bug", estimateSeconds: 3600 },
          ],
        },
      },
    });
    const card = proposal.tools[0]!;
    expect(card.preview).toMatchObject({
      target: "Mobile",
      targetKey: "projectId",
      nested: {
        milestones: [
          {
            title: "Design",
            leadLabel: null,
            releaseLabel: null,
            priority: null,
            tasks: [
              {
                title: "Card form",
                type: null,
                estimateSeconds: null,
                existing: false,
              },
            ],
          },
        ],
        tasks: [
          {
            title: "Receipts",
            type: "bug",
            estimateSeconds: 3600,
            existing: false,
          },
        ],
        unassignedReleaseLabel: null,
      },
    });
    expect(card.preview?.fields.map((field) => field.key)).toEqual([
      "projectId",
      "title",
      "description",
      "type",
    ]);

    const result = await ctx.decideOk(member, proposal.chatId, [
      { messageId: card.id, approve: true },
    ]);
    expect(result.messages[0]).toMatchObject({
      isError: false,
      resultSummary: {
        label: expect.stringMatching(/^Created MOB-\d+ Payments$/),
      },
    });
    const all = await ctx.tasks();
    const feature = all.find((task) => task.type === "feature");
    expect(feature?.title).toBe("Payments");
    const [milestone] = await db
      .select()
      .from(schema.milestoneTable)
      .where(eq(schema.milestoneTable.featureId, feature!.id));
    expect(milestone?.title).toBe("Design");
    expect(
      all
        .filter((task) => task.type !== "feature")
        .map((task) => [
          task.title,
          task.featureId,
          task.milestoneId,
          task.type,
          task.estimateSeconds,
        ])
        .sort(),
    ).toEqual([
      ["Card form", feature!.id, milestone!.id, "task", null],
      ["Receipts", feature!.id, null, "bug", 3600],
    ]);
    expect(ctx.writes()).toHaveLength(1);
  });

  it("leaves approvals unclaimed after the time budget pending", async () => {
    const ctx = await setup();
    const { member, mobile, workspace } = ctx;
    const proposal = await ctx.propose(
      member,
      { ...createTaskCall(mobile.project.id, "First"), id: "call_1" },
      { ...createTaskCall(mobile.project.id, "Second"), id: "call_2" },
    );
    expect(proposal.last).toEqual({ type: "done", pendingCount: 2 });

    const result = await decideApprovalsAs(
      {
        owner: {
          chatId: proposal.chatId,
          workspaceId: workspace.id,
          userId: member.id,
        },
        token: `token-${member.id}`,
        decisions: proposal.tools.map((tool) => ({
          messageId: tool.id,
          approve: true,
        })),
      },
      { budgetMs: 0 },
    );
    expect(result).toMatchObject({ pendingCount: 1, resumable: false });
    expect(result.messages.map((m) => m.toolCallId)).toEqual(["call_1"]);
    expect((await ctx.tasks()).map((task) => task.title)).toEqual(["First"]);
    expect(
      (await ctx.toolRows(proposal.chatId)).map((row) => row.approval),
    ).toEqual(["approved", "pending"]);
  });

  it("puts back a claimed approval whose write would start too late", async () => {
    const ctx = await setup();
    const { member, mobile, workspace } = ctx;
    const proposal = await ctx.propose(
      member,
      { ...createTaskCall(mobile.project.id, "First"), id: "call_1" },
      { ...createTaskCall(mobile.project.id, "Second"), id: "call_2" },
    );
    // Start, then the second claim in time, then its write too late.
    const clock = [0, 0, 60_000];
    const result = await decideApprovalsAs(
      {
        owner: {
          chatId: proposal.chatId,
          workspaceId: workspace.id,
          userId: member.id,
        },
        token: `token-${member.id}`,
        decisions: proposal.tools.map((tool) => ({
          messageId: tool.id,
          approve: true,
        })),
      },
      { budgetMs: 1_000, now: () => clock.shift() ?? 60_000 },
    );
    expect(result).toMatchObject({ pendingCount: 1, resumable: false });
    expect(result.messages.map((m) => m.toolCallId)).toEqual(["call_1"]);
    expect((await ctx.tasks()).map((task) => task.title)).toEqual(["First"]);
    const [, second] = await ctx.toolRows(proposal.chatId);
    expect(second).toMatchObject({
      approval: "pending",
      content: "",
      decidedAt: null,
    });
    expect(ctx.writes()).toHaveLength(1);
  });
});
