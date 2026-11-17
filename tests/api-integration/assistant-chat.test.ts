import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { startChat } from "../../apps/api/src/assistant/chats/start-chat";
import {
  DAILY_MODEL_CALLS_PER_USER,
  MAX_MODEL_CALLS_PER_TURN,
  MAX_TURNS_PER_USER,
} from "../../apps/api/src/assistant/constants";
import { sealAssistantKey } from "../../apps/api/src/assistant/settings/assistant-key-box";
import type { AssistantStreamEvent } from "../../apps/api/src/assistant/stream-events";
import {
  INVALID_ARGUMENTS,
  WRITE_NOT_PERMITTED,
} from "../../apps/api/src/assistant/turn/run-tool-calls";
import { SKIPPED_BY_NEW_MESSAGE } from "../../apps/api/src/assistant/turn/send-message";
import { turnSlotsInUse } from "../../apps/api/src/assistant/turn/turn-slots";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import {
  assistantChatTable,
  assistantMessageTable,
  assistantUsageTable,
  workspaceAssistantSettingTable,
} from "../../apps/api/src/database/schema";
import { createApp } from "../../apps/api/src/index";
import { ASSISTANT_WORKSPACE_HEADER } from "../../apps/api/src/utils/assistant-workspace-pin";
import {
  chatReply,
  completionChunk,
  type FakeOpenRouter,
  heldSseResponse,
  installFakeOpenRouter,
  sseResponse,
} from "./helpers/assistant/fake-openrouter";
import { mockSessionsByToken } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { createTaskFixture } from "./helpers/project-access/create-task-fixture";

const KEY = "sk-or-v1-chat-integration-0123456789abcdef-SECRET3";
const MODEL = "anthropic/claude-sonnet-5.5";
const OTHER_TASK_TITLE = "Secret task in the other workspace";

type User = typeof schema.userTable.$inferSelect;
type MessageInsert = typeof assistantMessageTable.$inferInsert;

let openRouter: FakeOpenRouter | null = null;
// Every response body the browser could see, checked for the key.
let bodies: string[] = [];

beforeEach(async () => {
  await resetTestDatabase();
  bodies = [];
});

afterEach(() => {
  const fake = openRouter;
  openRouter = null;
  fake?.restore();
  for (const body of bodies) expect(body).not.toContain(KEY);
  for (const request of fake?.loopbackRequests ?? []) {
    expect([...request.headers.values()].join("\n")).not.toContain(KEY);
  }
  for (const body of fake?.chatRequestBodies() ?? []) {
    expect(JSON.stringify(body)).not.toContain(KEY);
  }
});

/** The `data:` records of an SSE text; `: ping` comments are skipped. */
function parseEvents(text: string): AssistantStreamEvent[] {
  return text
    .split("\n\n")
    .filter((record) => record.startsWith("data: "))
    .map((record) => JSON.parse(record.slice("data: ".length)));
}

/** Reads a turn's events one at a time, keeping the raw text. */
function eventReader(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const queue: AssistantStreamEvent[] = [];
  let buffer = "";
  let raw = "";

  const next = async (): Promise<AssistantStreamEvent | null> => {
    while (queue.length === 0) {
      const { done, value } = await reader.read();
      if (done) return null;
      const text = decoder.decode(value, { stream: true });
      raw += text;
      buffer += text;
      const records = buffer.split("\n\n");
      buffer = records.pop() ?? "";
      queue.push(...parseEvents(records.map((r) => `${r}\n\n`).join("")));
    }
    return queue.shift() ?? null;
  };

  return {
    next,
    async until(type: AssistantStreamEvent["type"]) {
      const seen: AssistantStreamEvent[] = [];
      for (;;) {
        const event = await next();
        if (!event) throw new Error(`The stream ended before ${type}`);
        seen.push(event);
        if (event.type === type) return seen;
      }
    },
    cancel: () => reader.cancel(),
    raw: () => raw,
  };
}

async function eventually(check: () => Promise<boolean> | boolean) {
  const deadline = Date.now() + 10_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function expectError(response: Response, status: number, code: string) {
  const text = await response.clone().text();
  bodies.push(text);
  expect({ status: response.status, text }).toMatchObject({ status });
  expect(await readErrorBody(response)).toMatchObject({ code });
}

const terminal = (events: AssistantStreamEvent[]) =>
  events.filter((event) => event.type === "done" || event.type === "error");

const messagesOf = (events: AssistantStreamEvent[]) =>
  events.flatMap((event) => (event.type === "message" ? [event.message] : []));

const deltasOf = (events: AssistantStreamEvent[]) =>
  events.flatMap((event) => (event.type === "delta" ? [event.text] : []));

async function setup() {
  const ctx = await createRestrictedWorkspace();
  const member = ctx.restricted;
  const viewer = await addWorkspaceMember(ctx.workspace.id, "viewer");

  // A second workspace the member also belongs to: the turn is pinned to
  // the first, so nothing of this one may reach the model.
  const { workspace: other } = await createWorkspaceMember({
    role: "owner",
    workspaceName: "Other Workspace",
  });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId: other.id,
    userId: member.id,
    role: "member",
    joinedAt: new Date(),
  });
  const otherProject = await createProjectFixture({
    workspaceId: other.id,
    name: "Other Project",
    slug: "other",
  });
  const otherTask = await createTaskFixture(
    otherProject,
    OTHER_TASK_TITLE,
    member.id,
  );

  await db.insert(workspaceAssistantSettingTable).values({
    workspaceId: ctx.workspace.id,
    apiKeyCiphertext: sealAssistantKey(ctx.workspace.id, KEY),
    apiKeyHint: `…${KEY.slice(-4)}`,
    model: MODEL,
  });

  mockSessionsByToken([ctx.owner, member, viewer]);
  const { app } = createApp();
  const fake = installFakeOpenRouter({ app });
  openRouter = fake;

  const send = async (
    user: User,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.request(`/api/assistant/${ctx.workspace.id}${path}`, {
      method,
      headers: {
        authorization: `Bearer token-${user.id}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    });

  /** A turn request read to its end. */
  const turn = async (
    path: string,
    body: unknown,
    options: { user?: User; headers?: Record<string, string> } = {},
  ) => {
    const response = await send(
      options.user ?? member,
      "POST",
      path,
      body,
      options.headers,
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    bodies.push(text);
    const events = parseEvents(text);
    expect(terminal(events)).toHaveLength(1);
    expect(events.at(-1)).toEqual(terminal(events)[0]);
    return { response, text, events };
  };

  const getJson = async (path: string, user: User = member) => {
    const response = await send(user, "GET", path);
    const text = await response.text();
    bodies.push(text);
    expect(response.status).toBe(200);
    return { text, json: JSON.parse(text) };
  };

  const chatRows = (chatId: string) =>
    db
      .select()
      .from(assistantMessageTable)
      .where(eq(assistantMessageTable.chatId, chatId))
      .orderBy(asc(assistantMessageTable.seq));

  const chatRow = async (chatId: string) => {
    const [row] = await db
      .select()
      .from(assistantChatTable)
      .where(eq(assistantChatTable.id, chatId));
    return row!;
  };

  const chatCount = async () =>
    (await db.select({ id: assistantChatTable.id }).from(assistantChatTable))
      .length;

  const addChat = async (
    rows: Omit<MessageInsert, "chatId">[],
    userId = member.id,
  ) => {
    const [chat] = await db
      .insert(assistantChatTable)
      .values({ workspaceId: ctx.workspace.id, userId, title: "Earlier" })
      .returning();
    await db
      .insert(assistantMessageTable)
      .values(rows.map((row) => ({ ...row, chatId: chat!.id })));
    return chat!;
  };

  return {
    ...ctx,
    member,
    viewer,
    other,
    otherTask: otherTask!,
    fake,
    send,
    turn,
    getJson,
    chatRows,
    chatRow,
    chatCount,
    addChat,
  };
}

describe("assistant chat turns", () => {
  it("answers with a read that runs as the user, pinned to the workspace", async () => {
    const { member, workspace, alpha, beta, fake, turn, getJson, chatRows } =
      await setup();
    fake.queueChatResponses(
      chatReply({
        reasoning: "Look up the projects first.",
        toolCalls: [
          { id: "call_projects", name: "list_projects", arguments: {} },
        ],
      }),
      chatReply({ text: ["You can see ", "**Alpha**."] }),
    );

    const { response, events } = await turn(
      "/chats",
      { content: "Which projects can I see?", timeZone: "Europe/Berlin" },
      { headers: { "accept-encoding": "gzip, deflate" } },
    );

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("cache-control")).toBe(
      "no-store, no-transform",
    );
    expect(response.headers.get("content-encoding")).toBeNull();

    const [first, second] = events;
    expect(first).toEqual({
      type: "chat",
      chat: { id: expect.any(String), title: "Which projects can I see?" },
    });
    const chatId = first?.type === "chat" ? first.chat.id : "";
    expect(second).toMatchObject({
      type: "message",
      message: { role: "user", content: "Which projects can I see?" },
    });
    expect(deltasOf(events)).toEqual(["You can see ", "**Alpha**."]);
    expect(events.at(-1)).toEqual({ type: "done", pendingCount: 0 });
    expect(
      messagesOf(events).map((m) => [m.role, m.toolName, m.content]),
    ).toEqual([
      ["user", null, "Which projects can I see?"],
      ["assistant", null, ""],
      ["tool", "list_projects", ""],
      ["assistant", null, "You can see **Alpha**."],
    ]);
    expect(messagesOf(events)[1]?.toolCalls).toEqual([
      { id: "call_projects", name: "list_projects" },
    ]);

    // The read ran over loopback as the member, pinned to this workspace.
    expect(fake.loopbackRequests).toHaveLength(1);
    const [read] = fake.loopbackRequests;
    expect(read?.method).toBe("GET");
    expect(read?.path).toBe(`/api/project?workspaceId=${workspace.id}`);
    expect(read?.headers.get("authorization")).toBe(
      `Bearer token-${member.id}`,
    );
    expect(read?.headers.get(ASSISTANT_WORKSPACE_HEADER)).toBe(workspace.id);
    expect(read?.headers.get("x-kaneo-window-id")).toBeNull();

    const [ask, answer] = fake.chatRequestBodies();
    expect(
      fake.requestsTo("/chat/completions")[0]?.headers.get("authorization"),
    ).toBe(`Bearer ${KEY}`);
    expect(ask).toMatchObject({
      model: MODEL,
      stream: true,
      tool_choice: "auto",
      provider: { data_collection: "deny" },
    });
    expect(ask).not.toHaveProperty("temperature");
    expect(ask?.messages.map((m) => m.role)).toEqual(["system", "user"]);
    const offered = (ask?.tools ?? []).map((tool) => tool.function.name);
    expect(offered).toContain("list_projects");
    // Offered as proposals: nothing is written without an approval.
    expect(offered).toContain("create_task");
    const listProjects = ask?.tools?.find(
      (tool) => tool.function.name === "list_projects",
    ) as { function: { parameters: { properties: object } } } | undefined;
    expect(listProjects?.function.parameters.properties).not.toHaveProperty(
      "workspaceId",
    );

    expect(answer?.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    const [, , step, result] = answer!.messages;
    expect(step?.tool_calls?.[0]).toMatchObject({
      id: "call_projects",
      function: { name: "list_projects" },
    });
    expect(step?.reasoning_details).toEqual([
      expect.objectContaining({
        type: "reasoning.text",
        text: "Look up the projects first.",
        signature: "sig-fake",
      }),
    ]);
    expect(result?.tool_call_id).toBe("call_projects");
    // The member sees Alpha only: the restricted project stays invisible.
    expect(result?.content).toContain(alpha.id);
    expect(result?.content).not.toContain(beta.id);
    expect(JSON.stringify(fake.chatRequestBodies())).not.toContain(
      "@example.com",
    );

    const rows = await chatRows(chatId);
    expect(rows.map((row) => [row.role, row.status])).toEqual([
      ["user", "complete"],
      ["assistant", "complete"],
      ["tool", "complete"],
      ["assistant", "complete"],
    ]);
    expect(rows[1]).toMatchObject({
      model: MODEL,
      toolCalls: [
        { id: "call_projects", name: "list_projects", arguments: "{}" },
      ],
      usage: { promptTokens: 1200, completionTokens: 40, costUsd: 0.0028 },
    });
    expect(rows[1]?.reasoningDetails).toHaveLength(1);
    expect(rows[2]).toMatchObject({
      toolCallId: "call_projects",
      toolName: "list_projects",
      approval: null,
      isError: false,
    });
    expect(JSON.parse(rows[2]!.toolArgs!)).toEqual({
      workspaceId: workspace.id,
    });

    const [usage] = await db.select().from(assistantUsageTable);
    expect(usage).toMatchObject({
      userId: member.id,
      modelCalls: 2,
      promptTokens: 2400,
      completionTokens: 80,
    });
    expect((await db.select().from(assistantChatTable))[0]).toMatchObject({
      busyToken: null,
      busyUntil: null,
    });
    expect(turnSlotsInUse()).toBe(0);

    // The transcript comes back without the read result or the reasoning.
    const detail = await getJson(`/chats/${chatId}`);
    expect(detail.json).toMatchObject({
      pendingCount: 0,
      resumable: false,
    });
    expect(
      detail.json.messages.map((m: { role: string; content: string }) => [
        m.role,
        m.content,
      ]),
    ).toEqual([
      ["user", "Which projects can I see?"],
      ["assistant", ""],
      ["tool", ""],
      ["assistant", "You can see **Alpha**."],
    ]);
    expect(detail.text).not.toContain(alpha.id);
    expect(detail.text).not.toContain("Look up the projects");
  });

  it("passes the caller's own session token to the reads it runs", async () => {
    const { member, alpha, fake, send, turn } = await setup();
    // A real session row, looked up by Better Auth itself.
    vi.mocked(auth.api.getSession).mockRestore();
    const token = `assistant-${randomUUID()}`;
    await db.insert(schema.sessionTable).values({
      id: randomUUID(),
      userId: member.id,
      token,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    fake.queueChatResponses(
      chatReply({
        toolCalls: [
          { id: "call_projects", name: "list_projects", arguments: {} },
        ],
      }),
      chatReply({ text: ["You can see Alpha."] }),
    );

    const { events } = await turn(
      "/chats",
      { content: "Which projects can I see?" },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(events.at(-1)).toEqual({ type: "done", pendingCount: 0 });

    expect(fake.loopbackRequests).toHaveLength(1);
    expect(fake.loopbackRequests[0]?.headers.get("authorization")).toBe(
      `Bearer ${token}`,
    );
    // The read authenticated as the member and saw their project.
    const [, answer] = fake.chatRequestBodies();
    const result = answer!.messages.find((m) => m.role === "tool");
    expect(result?.content).toContain(alpha.id);

    const forged = await send(
      member,
      "POST",
      "/chats",
      { content: "Hi" },
      { authorization: `Bearer token-${member.id}` },
    );
    expect(forged.status).toBe(401);
    expect(fake.chatRequestBodies()).toHaveLength(2);
  });

  it("keeps restricted projects and other workspaces out of the model's reach", async () => {
    const { alphaTask, betaTask, otherTask, fake, turn, chatRows } =
      await setup();
    fake.queueChatResponses(
      chatReply({
        toolCalls: [
          {
            id: "call_a",
            name: "get_task",
            arguments: { taskId: alphaTask!.id },
          },
          {
            id: "call_b",
            name: "get_task",
            arguments: { taskId: betaTask!.id },
          },
          {
            id: "call_other",
            name: "get_task",
            arguments: { taskId: otherTask.id },
          },
        ],
      }),
      chatReply({ text: ["One of those tasks is visible."] }),
    );

    const { events } = await turn("/chats", { content: "Show me the tasks" });
    expect(events.at(-1)).toEqual({ type: "done", pendingCount: 0 });

    const tools = messagesOf(events).filter((m) => m.role === "tool");
    expect(tools.map((m) => [m.toolCallId, m.isError])).toEqual([
      ["call_a", false],
      ["call_b", true],
      ["call_other", true],
    ]);
    for (const failed of tools.slice(1)) {
      expect(failed.errorText).toEqual(expect.any(String));
      expect(failed.errorText).not.toContain(OTHER_TASK_TITLE);
      expect(failed.errorText).not.toContain("Hidden beta task");
    }

    expect(fake.loopbackRequests.map((r) => r.path).sort()).toEqual(
      [alphaTask!.id, betaTask!.id, otherTask.id]
        .map((id) => `/api/task/${id}`)
        .sort(),
    );
    for (const request of fake.loopbackRequests) {
      expect(request.method).toBe("GET");
    }

    const [, answer] = fake.chatRequestBodies();
    const results = answer!.messages.filter((m) => m.role === "tool");
    expect(results.map((m) => m.tool_call_id)).toEqual([
      "call_a",
      "call_b",
      "call_other",
    ]);
    expect(results[0]?.content).toContain("Visible alpha task");
    const sent = JSON.stringify(fake.chatRequestBodies());
    expect(sent).not.toContain("Hidden beta task");
    expect(sent).not.toContain(OTHER_TASK_TITLE);
    expect(sent).not.toContain("Other Workspace");

    const chatId = events[0]?.type === "chat" ? events[0].chat.id : "";
    const rows = (await chatRows(chatId)).filter((row) => row.role === "tool");
    expect(rows.map((row) => row.isError)).toEqual([false, true, true]);
  });

  it("refuses invalid write, unknown and malformed tool calls with errors the model can correct", async () => {
    const { alpha, fake, turn, chatRows } = await setup();
    const tasksBefore = await db.select().from(schema.taskTable);
    fake.queueChatResponses(
      chatReply({
        toolCalls: [
          {
            id: "call_write",
            name: "create_task",
            arguments: { projectId: alpha.id, title: "Injected task" },
          },
          { id: "call_unknown", name: "drop_everything", arguments: {} },
          {
            id: "call_broken",
            name: "list_projects",
            arguments: '{"includeArchived": tru',
          },
        ],
      }),
      chatReply({ text: ["I can only look things up here."] }),
    );

    const { events } = await turn("/chats", { content: "Create a task" });
    expect(events.at(-1)).toEqual({ type: "done", pendingCount: 0 });

    // The create_task call lacks its description, so nothing is proposed.
    const tools = messagesOf(events).filter((m) => m.role === "tool");
    expect(tools.map((m) => [m.toolName, m.isError, m.approval])).toEqual([
      ["create_task", true, null],
      ["drop_everything", true, null],
      ["list_projects", true, null],
    ]);
    expect(tools[0]?.errorText).toContain("description");
    expect(tools[0]?.preview).toBeNull();

    // Nothing reached the API, and no task was created.
    expect(fake.loopbackRequests).toEqual([]);
    expect(await db.select().from(schema.taskTable)).toHaveLength(
      tasksBefore.length,
    );

    const [, answer] = fake.chatRequestBodies();
    const step = answer!.messages.find((m) => m.role === "assistant");
    expect(step?.tool_calls?.map((call) => call.function.arguments)).toEqual([
      JSON.stringify({ projectId: alpha.id, title: "Injected task" }),
      "{}",
      "{}",
    ]);
    const results = answer!.messages.filter((m) => m.role === "tool");
    expect(results[0]?.content).toContain("description");
    expect(results[1]?.content).toContain('no tool named "drop_everything"');
    expect(results[2]?.content).toBe(INVALID_ARGUMENTS);

    const chatId = events[0]?.type === "chat" ? events[0].chat.id : "";
    const rows = (await chatRows(chatId)).filter((row) => row.role === "tool");
    expect(rows.map((row) => row.toolArgs)).toEqual([null, null, null]);
  });

  it("offers a viewer no write tools and refuses a write call unrun", async () => {
    const { alpha, viewer, fake, turn } = await setup();
    fake.queueChatResponses(
      chatReply({
        toolCalls: [
          {
            id: "call_write",
            name: "create_task",
            arguments: {
              projectId: alpha.id,
              title: "Sneaky",
              description: "",
            },
          },
        ],
      }),
      chatReply({ text: ["Your role can't make changes here."] }),
    );

    const { events } = await turn(
      "/chats",
      { content: "Create a task" },
      { user: viewer },
    );
    expect(events.at(-1)).toEqual({ type: "done", pendingCount: 0 });
    const [ask, answer] = fake.chatRequestBodies();
    const offered = (ask?.tools ?? []).map((tool) => tool.function.name);
    expect(offered).toContain("list_projects");
    for (const name of ["create_task", "update_task", "create_project_page"])
      expect(offered).not.toContain(name);
    expect(ask?.messages[0]?.content).toContain('"canWrite": false');

    const [card] = messagesOf(events).filter((m) => m.role === "tool");
    expect(card).toMatchObject({ isError: true, approval: null });
    expect(answer!.messages.filter((m) => m.role === "tool")[0]?.content).toBe(
      WRITE_NOT_PERMITTED,
    );
    expect(fake.loopbackRequests).toEqual([]);
  });

  it("reports a mid-stream provider error by its code and keeps the partial answer", async () => {
    const { fake, turn, chatRows, getJson } = await setup();
    fake.queueChatResponses(
      sseResponse([
        completionChunk({ role: "assistant", content: "" }),
        completionChunk({ content: "Partial " }),
        {
          ...completionChunk({}, "error"),
          error: { code: 502, message: "upstream detail: provider exploded" },
        },
      ]),
    );

    const { text, events } = await turn("/chats", { content: "Summarize" });
    expect(deltasOf(events)).toEqual(["Partial "]);
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "OPENROUTER_UNAVAILABLE",
      retryable: true,
    });
    expect(text).not.toContain("upstream detail");
    expect(text).not.toContain("provider exploded");

    const chatId = events[0]?.type === "chat" ? events[0].chat.id : "";
    const rows = await chatRows(chatId);
    expect(rows.map((row) => [row.role, row.status, row.content])).toEqual([
      ["user", "complete", "Summarize"],
      ["assistant", "interrupted", "Partial "],
    ]);
    expect((await getJson(`/chats/${chatId}`)).json.resumable).toBe(true);
  });

  it("records a rejected key on the settings and clears it after a success", async () => {
    const { workspace, fake, turn, getJson } = await setup();
    fake.queueChatResponses({
      status: 401,
      json: { error: { code: 401, message: "No auth credentials found" } },
    });

    const { text, events } = await turn("/chats", { content: "Hello" });
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "OPENROUTER_KEY_INVALID",
      retryable: false,
    });
    expect(text).not.toContain("No auth credentials");
    expect(fake.requestsTo("/chat/completions")).toHaveLength(1);

    const settings = () =>
      db
        .select()
        .from(workspaceAssistantSettingTable)
        .where(eq(workspaceAssistantSettingTable.workspaceId, workspace.id));
    expect((await settings())[0]).toMatchObject({
      lastErrorCode: "OPENROUTER_KEY_INVALID",
      lastErrorAt: expect.any(Date),
    });
    expect((await getJson("/status")).json).toMatchObject({
      enabled: true,
      reason: "key_rejected",
    });

    // The failed turn left the question unanswered, so Continue retries it.
    const chatId = events[0]?.type === "chat" ? events[0].chat.id : "";
    fake.queueChatResponses(chatReply({ text: ["Hi there."] }));
    const retried = await turn(`/chats/${chatId}/continue`, {});
    expect(retried.events.at(-1)).toEqual({ type: "done", pendingCount: 0 });
    expect((await settings())[0]).toMatchObject({
      lastErrorCode: null,
      lastErrorAt: null,
    });
  });

  it("refuses a second turn while one answers, keeps a stopped answer and continues it", async () => {
    const { member, fake, send, turn, chatRows, chatRow, getJson } =
      await setup();
    fake.queueChatResponses(
      heldSseResponse([
        completionChunk({ role: "assistant", content: "" }),
        completionChunk({ content: "Thinking about it" }),
      ]),
    );

    const response = await send(member, "POST", "/chats", {
      content: "What changed this week?",
    });
    expect(response.status).toBe(200);
    const stream = eventReader(response);
    const opening = await stream.until("delta");
    const chatId = opening[0]?.type === "chat" ? opening[0].chat.id : "";
    expect(chatId).not.toBe("");

    await expectError(
      await send(member, "POST", `/chats/${chatId}/messages`, {
        content: "And last week?",
      }),
      409,
      "ASSISTANT_CHAT_BUSY",
    );
    await expectError(
      await send(member, "POST", `/chats/${chatId}/continue`, {}),
      409,
      "ASSISTANT_CHAT_BUSY",
    );
    await expectError(
      await send(member, "DELETE", `/chats/${chatId}`),
      409,
      "ASSISTANT_CHAT_BUSY",
    );
    expect(turnSlotsInUse()).toBe(1);

    // The browser goes away mid-answer.
    await stream.cancel();
    bodies.push(stream.raw());
    await eventually(async () => (await chatRow(chatId)).busyToken === null);
    await eventually(() => turnSlotsInUse() === 0);
    expect(fake.requestsTo("/chat/completions")[0]?.signal.aborted).toBe(true);

    const rows = await chatRows(chatId);
    expect(rows.map((row) => [row.role, row.status, row.content])).toEqual([
      ["user", "complete", "What changed this week?"],
      ["assistant", "interrupted", "Thinking about it"],
    ]);
    expect((await chatRow(chatId)).busyUntil).toBeNull();
    const detail = await getJson(`/chats/${chatId}`);
    expect(detail.json.resumable).toBe(true);

    // Continue resumes from the question; the stopped answer is not replayed.
    fake.queueChatResponses(chatReply({ text: ["Here is the full answer."] }));
    const resumed = await turn(`/chats/${chatId}/continue`, {
      timeZone: "UTC",
    });
    expect(resumed.events.find((e) => e.type === "chat")).toBeUndefined();
    expect(messagesOf(resumed.events).map((m) => m.content)).toEqual([
      "Here is the full answer.",
    ]);
    expect(resumed.events.at(-1)).toEqual({ type: "done", pendingCount: 0 });
    const history = fake.chatRequestBodies().at(-1)!.messages;
    expect(history.map((m) => m.role)).toEqual(["system", "user"]);
    expect(history.at(-1)?.content).toBe("What changed this week?");
    expect(JSON.stringify(history)).not.toContain("Thinking about it");

    await expectError(
      await send(member, "POST", `/chats/${chatId}/continue`, {}),
      409,
      "ASSISTANT_NOTHING_TO_CONTINUE",
    );
  });

  it("frees the turn slot and the lease after early refusals", async () => {
    const {
      owner,
      member,
      workspace,
      fake,
      send,
      turn,
      chatRows,
      chatRow,
      chatCount,
      addChat,
    } = await setup();
    const busy = await startChat({
      workspaceId: workspace.id,
      userId: member.id,
      content: "Still answering",
    });
    const answered = await addChat([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!", model: MODEL },
    ]);
    const pending = await addChat([
      { role: "user", content: "Create a task" },
      {
        role: "assistant",
        content: "",
        model: MODEL,
        toolCalls: [{ id: "call_write", name: "create_task", arguments: "{}" }],
      },
      {
        role: "tool",
        toolCallId: "call_write",
        toolName: "create_task",
        approval: "pending",
      },
    ]);
    const ownersChat = await addChat(
      [{ role: "user", content: "Mine" }],
      owner.id,
    );
    const chatsBefore = await chatCount();

    const refusals: [() => Promise<Response>, number, string][] = [
      [
        () =>
          send(member, "POST", `/chats/${busy.chat.id}/messages`, {
            content: "Again",
          }),
        409,
        "ASSISTANT_CHAT_BUSY",
      ],
      [
        () => send(member, "POST", "/chats", { content: "   " }),
        400,
        "VALIDATION_ERROR",
      ],
      [
        () => send(member, "POST", "/chats", { content: "Hi", extra: true }),
        400,
        "VALIDATION_ERROR",
      ],
      [
        () => send(member, "POST", "/chats", { content: "x".repeat(70_000) }),
        413,
        "PAYLOAD_TOO_LARGE",
      ],
      // PostgreSQL can't store NUL, so it must never reach an insert.
      [
        () => send(member, "POST", "/chats", { content: "Hi\u0000there" }),
        400,
        "VALIDATION_ERROR",
      ],
      [
        () =>
          send(member, "POST", `/chats/${answered.id}/messages`, {
            content: "\u0000",
          }),
        400,
        "VALIDATION_ERROR",
      ],
      [
        () =>
          send(member, "POST", "/chats", "content=Hi", {
            "content-type": "text/plain",
          }),
        400,
        "UNSUPPORTED_CONTENT_TYPE",
      ],
      [
        () => send(member, "POST", `/chats/${answered.id}/continue`, {}),
        409,
        "ASSISTANT_NOTHING_TO_CONTINUE",
      ],
      [
        () => send(member, "POST", `/chats/${pending.id}/continue`, {}),
        409,
        "ASSISTANT_PENDING_APPROVALS",
      ],
      [
        () =>
          send(member, "POST", `/chats/${ownersChat.id}/messages`, {
            content: "Peek",
          }),
        404,
        "ASSISTANT_CHAT_NOT_FOUND",
      ],
    ];
    for (const [request, status, code] of refusals) {
      await expectError(await request(), status, code);
      expect(turnSlotsInUse()).toBe(0);
    }
    expect(await chatCount()).toBe(chatsBefore);
    expect(fake.requestsTo("/chat/completions")).toEqual([]);
    for (const chat of [answered, pending]) {
      expect((await chatRow(chat.id)).busyToken).toBeNull();
    }
    expect(await chatRows(answered.id)).toHaveLength(2);
    expect((await chatRow(busy.chat.id)).busyToken).toBe(busy.leaseToken);

    // A new message skips the pending proposal and still streams.
    fake.queueChatResponses(chatReply({ text: ["Okay, I left it."] }));
    const { events } = await turn(`/chats/${pending.id}/messages`, {
      content: "Never mind",
    });
    expect(
      messagesOf(events).map((m) => [m.role, m.approval, m.content]),
    ).toEqual([
      ["tool", "skipped", ""],
      ["user", null, "Never mind"],
      ["assistant", null, "Okay, I left it."],
    ]);
    expect(events.at(-1)).toEqual({ type: "done", pendingCount: 0 });
    expect(turnSlotsInUse()).toBe(0);

    const [skipped] = (await chatRows(pending.id)).filter(
      (row) => row.role === "tool",
    );
    expect(skipped).toMatchObject({
      approval: "skipped",
      content: SKIPPED_BY_NEW_MESSAGE,
      decidedAt: expect.any(Date),
    });
    const history = fake.chatRequestBodies().at(-1)!.messages;
    expect(history.map((m) => [m.role, m.content])).toEqual([
      ["system", expect.any(String)],
      ["user", "Create a task"],
      ["assistant", null],
      ["tool", SKIPPED_BY_NEW_MESSAGE],
      ["user", "Never mind"],
    ]);
  });

  it("refuses a turn over the per-user cap with Retry-After and leaves nothing behind", async () => {
    const { member, fake, send, chatRows, chatRow, chatCount, addChat } =
      await setup();
    const idle = await addChat([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!", model: MODEL },
    ]);
    const held = () =>
      heldSseResponse([
        completionChunk({ role: "assistant", content: "" }),
        completionChunk({ content: "Working" }),
      ]);
    fake.queueChatResponses(
      ...Array.from({ length: MAX_TURNS_PER_USER }, held),
    );
    const streams = [];
    for (let index = 0; index < MAX_TURNS_PER_USER; index++) {
      const response = await send(member, "POST", "/chats", {
        content: `Question ${index + 1}`,
      });
      expect(response.status).toBe(200);
      const stream = eventReader(response);
      await stream.until("delta");
      streams.push(stream);
    }
    expect(turnSlotsInUse()).toBe(MAX_TURNS_PER_USER);

    const refused = await send(member, "POST", "/chats", { content: "More" });
    expect(refused.headers.get("retry-after")).toBe("5");
    await expectError(refused, 429, "ASSISTANT_TOO_MANY_TURNS");
    expect(await chatCount()).toBe(MAX_TURNS_PER_USER + 1);

    const next = await send(member, "POST", `/chats/${idle.id}/messages`, {
      content: "Another",
    });
    expect(next.headers.get("retry-after")).toBe("5");
    await expectError(next, 429, "ASSISTANT_TOO_MANY_TURNS");
    expect((await chatRow(idle.id)).busyToken).toBeNull();
    expect(await chatRows(idle.id)).toHaveLength(2);

    for (const stream of streams) {
      await stream.cancel();
      bodies.push(stream.raw());
    }
    await eventually(() => turnSlotsInUse() === 0);
  });

  it("ends a turn at the model call limit", async () => {
    const { fake, turn, getJson } = await setup();
    fake.queueChatResponses(
      ...Array.from({ length: MAX_MODEL_CALLS_PER_TURN }, (_, index) =>
        chatReply({
          toolCalls: [
            { id: `call_${index}`, name: "list_projects", arguments: {} },
          ],
        }),
      ),
    );

    const { events } = await turn("/chats", { content: "Keep looking" });
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "ASSISTANT_STEP_LIMIT",
      retryable: true,
    });
    expect(fake.chatRequestBodies()).toHaveLength(MAX_MODEL_CALLS_PER_TURN);
    expect(fake.loopbackRequests).toHaveLength(MAX_MODEL_CALLS_PER_TURN);
    const [usage] = await db.select().from(assistantUsageTable);
    expect(usage?.modelCalls).toBe(MAX_MODEL_CALLS_PER_TURN);

    const chatId = events[0]?.type === "chat" ? events[0].chat.id : "";
    expect((await getJson(`/chats/${chatId}`)).json.resumable).toBe(true);
  });

  it("stops at the daily cap, mid-turn and before the next turn", async () => {
    const { member, workspace, fake, send, turn, chatCount } = await setup();
    const day = new Date().toISOString().slice(0, 10);
    await db.insert(assistantUsageTable).values({
      workspaceId: workspace.id,
      userId: member.id,
      day,
      modelCalls: DAILY_MODEL_CALLS_PER_USER - 1,
    });
    fake.queueChatResponses(
      chatReply({
        toolCalls: [
          { id: "call_projects", name: "list_projects", arguments: {} },
        ],
      }),
      chatReply({ text: ["Never sent"] }),
    );

    const { events } = await turn("/chats", { content: "One more question" });
    expect(messagesOf(events).map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "ASSISTANT_DAILY_LIMIT",
      retryable: false,
    });
    expect(fake.chatRequestBodies()).toHaveLength(1);
    const usage = await db
      .select()
      .from(assistantUsageTable)
      .where(
        and(
          eq(assistantUsageTable.workspaceId, workspace.id),
          eq(assistantUsageTable.userId, member.id),
        ),
      );
    expect(usage[0]?.modelCalls).toBe(DAILY_MODEL_CALLS_PER_USER);

    const chatId = events[0]?.type === "chat" ? events[0].chat.id : "";
    await expectError(
      await send(member, "POST", "/chats", { content: "And another" }),
      429,
      "ASSISTANT_DAILY_LIMIT",
    );
    await expectError(
      await send(member, "POST", `/chats/${chatId}/continue`, {}),
      429,
      "ASSISTANT_DAILY_LIMIT",
    );
    expect(await chatCount()).toBe(1);
    expect(fake.chatRequestBodies()).toHaveLength(1);
    expect(turnSlotsInUse()).toBe(0);
  });
});
