import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  acquireChatLease,
  releaseChatLease,
  renewChatLease,
} from "../../apps/api/src/assistant/chats/chat-lease";
import { startChat } from "../../apps/api/src/assistant/chats/start-chat";
import { touchChat } from "../../apps/api/src/assistant/chats/touch-chat";
import {
  CHAT_MESSAGES_PAGE,
  DAILY_MODEL_CALLS_PER_USER,
  HISTORY_MAX_CHARS,
} from "../../apps/api/src/assistant/constants";
import { sealAssistantKey } from "../../apps/api/src/assistant/settings/assistant-key-box";
import { buildMessages } from "../../apps/api/src/assistant/turn/build-messages";
import {
  loadTranscript,
  TRANSCRIPT_ROWS,
} from "../../apps/api/src/assistant/turn/turn-messages";
import {
  checkDailyAllowance,
  recordUsage,
  reserveModelCall,
} from "../../apps/api/src/assistant/turn/usage";
import db, { schema } from "../../apps/api/src/database";
import {
  assistantChatTable,
  assistantMessageTable,
  assistantUsageTable,
  workspaceAssistantSettingTable,
} from "../../apps/api/src/database/schema";
import { ApiError } from "../../apps/api/src/errors/api-error";
import { createApp } from "../../apps/api/src/index";
import {
  chatReply,
  installFakeOpenRouter,
} from "./helpers/assistant/fake-openrouter";
import { mockSessionsByToken } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import { createWorkspaceMember } from "./helpers/fixtures";

type User = typeof schema.userTable.$inferSelect;
type MessageInsert = typeof assistantMessageTable.$inferInsert;

beforeEach(async () => {
  await resetTestDatabase();
});

async function addUser(name: string) {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: `user-${randomUUID()}`,
      email: `${randomUUID()}@example.com`,
      emailVerified: true,
      name,
    })
    .returning();
  return user!;
}

async function join(workspaceId: string, userId: string) {
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId,
    role: "member",
    joinedAt: new Date(),
  });
}

async function setup() {
  const { user: ada, workspace } = await createWorkspaceMember({
    role: "admin",
    userName: "Ada",
  });
  const { workspace: other } = await createWorkspaceMember({ role: "admin" });
  await join(other.id, ada.id);
  const mo = await addUser("Mo");
  await join(workspace.id, mo.id);
  mockSessionsByToken([ada, mo]);
  const { app } = createApp();

  const call = (
    user: User,
    method: string,
    path: string,
    workspaceId = workspace.id,
  ) =>
    app.request(`/api/assistant/${workspaceId}${path}`, {
      method,
      headers: { authorization: `Bearer token-${user.id}` },
    });

  /** A turn request as `user`, read to its end. */
  const turn = async (user: User, path: string, body: unknown) => {
    const response = await app.request(
      `/api/assistant/${workspace.id}${path}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer token-${user.id}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    expect(response.status).toBe(200);
    return response.text();
  };

  return { ada, mo, workspace, other, call, turn };
}

async function addChat(
  values: Partial<typeof assistantChatTable.$inferInsert> & {
    workspaceId: string;
    userId: string;
  },
) {
  const [chat] = await db
    .insert(assistantChatTable)
    .values({ title: "A chat", ...values })
    .returning();
  return chat!;
}

async function addMessages(
  chatId: string,
  rows: Omit<MessageInsert, "chatId">[],
) {
  return db
    .insert(assistantMessageTable)
    .values(rows.map((row) => ({ ...row, chatId })))
    .returning();
}

async function chatExists(chatId: string) {
  const rows = await db
    .select({ id: assistantChatTable.id })
    .from(assistantChatTable)
    .where(eq(assistantChatTable.id, chatId));
  return rows.length === 1;
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await readErrorBody(response)).toMatchObject({ code });
}

type ChatList = {
  chats: { id: string; busy: boolean; pendingCount: number }[];
  nextCursor: string | null;
};

describe("assistant chats", () => {
  it("lists only the caller's chats in the workspace, latest activity first", async () => {
    const { ada, mo, workspace, other, call } = await setup();
    const base = Date.now() - 60_000;
    const at = (seconds: number) => new Date(base + seconds * 1000);
    const oldest = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
      updatedAt: at(1),
    });
    const busy = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
      updatedAt: at(2),
      busyUntil: new Date(Date.now() + 60_000),
      busyToken: "lease",
    });
    // Same time as `busy`: the id breaks the tie.
    const tied = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
      updatedAt: at(2),
    });
    // Database default: microseconds a JS Date can't hold.
    const newest = await addChat({ workspaceId: workspace.id, userId: ada.id });
    await addChat({ workspaceId: other.id, userId: ada.id });
    const mine = await addChat({ workspaceId: workspace.id, userId: mo.id });
    await addMessages(oldest.id, [
      { role: "user", content: "Rename it" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "update_task", arguments: "{}" }],
      },
      {
        role: "tool",
        toolCallId: "c1",
        toolName: "update_task",
        approval: "pending",
      },
    ]);

    const response = await call(ada, "GET", "/chats");
    expect(response.status).toBe(200);
    const full = (await response.json()) as ChatList;
    const tiedFirst = [busy.id, tied.id].sort().reverse();
    expect(full.chats.map((chat) => chat.id)).toEqual([
      newest.id,
      ...tiedFirst,
      oldest.id,
    ]);
    expect(full.nextCursor).toBeNull();
    expect(full.chats.find((chat) => chat.id === busy.id)?.busy).toBe(true);
    expect(full.chats.find((chat) => chat.id === tied.id)?.busy).toBe(false);
    expect(full.chats.find((chat) => chat.id === oldest.id)?.pendingCount).toBe(
      1,
    );

    const paged: string[] = [];
    let before: string | null = null;
    do {
      const query: string = before ? `?limit=1&before=${before}` : "?limit=1";
      const page = (await (
        await call(ada, "GET", `/chats${query}`)
      ).json()) as ChatList;
      expect(page.chats.length).toBeLessThanOrEqual(1);
      paged.push(...page.chats.map((chat) => chat.id));
      before = page.nextCursor;
    } while (before);
    expect(paged).toEqual(full.chats.map((chat) => chat.id));

    const moList = (await (await call(mo, "GET", "/chats")).json()) as ChatList;
    expect(moList.chats.map((chat) => chat.id)).toEqual([mine.id]);

    await expectError(
      await call(ada, "GET", "/chats?before=bogus"),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("moves a chat to the top when a turn starts in it", async () => {
    const { ada, workspace, call, turn } = await setup();
    const key = "sk-or-v1-chats-integration-0123456789abcdef-SECRET5";
    await db.insert(workspaceAssistantSettingTable).values({
      workspaceId: workspace.id,
      apiKeyCiphertext: sealAssistantKey(workspace.id, key),
      apiKeyHint: `…${key.slice(-4)}`,
      model: "anthropic/claude-sonnet-5.5",
    });
    const fake = installFakeOpenRouter();
    try {
      const minutesAgo = (minutes: number) =>
        new Date(Date.now() - minutes * 60_000);
      const answered = await addChat({
        workspaceId: workspace.id,
        userId: ada.id,
        updatedAt: minutesAgo(30),
      });
      await addMessages(answered.id, [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello." },
      ]);
      const cutOff = await addChat({
        workspaceId: workspace.id,
        userId: ada.id,
        updatedAt: minutesAgo(20),
      });
      await addMessages(cutOff.id, [
        { role: "user", content: "Summarize" },
        { role: "assistant", content: "Part", status: "interrupted" },
      ]);
      const recent = await addChat({
        workspaceId: workspace.id,
        userId: ada.id,
        updatedAt: minutesAgo(10),
      });
      const listed = async () =>
        (
          (await (await call(ada, "GET", "/chats")).json()) as ChatList
        ).chats.map((chat) => chat.id);
      expect(await listed()).toEqual([recent.id, cutOff.id, answered.id]);

      fake.queueChatResponses(chatReply({ text: ["Sure."] }));
      await turn(ada, `/chats/${answered.id}/messages`, { content: "More" });
      expect(await listed()).toEqual([answered.id, recent.id, cutOff.id]);

      fake.queueChatResponses(chatReply({ text: ["The summary."] }));
      await turn(ada, `/chats/${cutOff.id}/continue`, {});
      expect(await listed()).toEqual([cutOff.id, answered.id, recent.id]);
    } finally {
      fake.restore();
    }
  });

  it("keeps every chat private to its author and workspace", async () => {
    const { ada, mo, workspace, other, call } = await setup();
    const adaChat = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
    });
    const elsewhere = await addChat({ workspaceId: other.id, userId: ada.id });

    await expectError(
      await call(mo, "GET", `/chats/${adaChat.id}`),
      404,
      "ASSISTANT_CHAT_NOT_FOUND",
    );
    await expectError(
      await call(mo, "DELETE", `/chats/${adaChat.id}`),
      404,
      "ASSISTANT_CHAT_NOT_FOUND",
    );
    expect(await chatExists(adaChat.id)).toBe(true);

    // Ada belongs to both workspaces, but a chat answers only under its own.
    await expectError(
      await call(ada, "GET", `/chats/${adaChat.id}`, other.id),
      404,
      "ASSISTANT_CHAT_NOT_FOUND",
    );
    await expectError(
      await call(ada, "DELETE", `/chats/${elsewhere.id}`),
      404,
      "ASSISTANT_CHAT_NOT_FOUND",
    );
    expect(await chatExists(elsewhere.id)).toBe(true);

    expect((await call(ada, "GET", `/chats/${adaChat.id}`)).status).toBe(200);
  });

  it("returns the latest messages without read results, arguments or reasoning", async () => {
    const { ada, workspace, call } = await setup();
    const chat = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
      title: "Roadmap",
    });
    const [question] = await addMessages(chat.id, [
      { role: "user", content: "What is on the roadmap?" },
      {
        role: "assistant",
        content: "",
        model: "anthropic/claude-sonnet-5.5",
        toolCalls: [
          {
            id: "c1",
            name: "get_project_page",
            arguments: '{"id":"SECRET-ARGUMENT"}',
          },
          { id: "c2", name: "get_task", arguments: "{}" },
        ],
        reasoningDetails: [
          { type: "reasoning.text", text: "SECRET-REASONING" },
        ],
      },
      {
        role: "tool",
        toolCallId: "c1",
        toolName: "get_project_page",
        content: "SECRET-READ-RESULT",
      },
      {
        role: "tool",
        toolCallId: "c2",
        toolName: "get_task",
        isError: true,
        content: "get_task: 404\nTask not found",
      },
      { role: "assistant", content: "The roadmap has two items." },
    ]);

    const response = await call(ada, "GET", `/chats/${chat.id}`);
    expect(response.status).toBe(200);
    const text = await response.clone().text();
    for (const secret of [
      "SECRET-ARGUMENT",
      "SECRET-REASONING",
      "SECRET-READ-RESULT",
    ]) {
      expect(text).not.toContain(secret);
    }
    const detail = (await response.json()) as {
      chat: { id: string; title: string };
      messages: Record<string, unknown>[];
      hasOlder: boolean;
      pendingCount: number;
      resumable: boolean;
    };
    expect(detail.chat).toMatchObject({ id: chat.id, title: "Roadmap" });
    expect(detail.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "tool",
      "assistant",
    ]);
    expect(detail.messages[0]).toMatchObject({
      id: question!.id,
      content: "What is on the roadmap?",
    });
    expect(detail.messages[1]).toMatchObject({
      content: "",
      toolCalls: [
        { id: "c1", name: "get_project_page" },
        { id: "c2", name: "get_task" },
      ],
    });
    expect(detail.messages[2]).toMatchObject({
      content: "",
      isError: false,
      errorText: null,
    });
    expect(detail.messages[3]).toMatchObject({
      content: "",
      isError: true,
      errorText: "get_task: 404 Task not found",
    });
    expect(detail).toMatchObject({
      hasOlder: false,
      pendingCount: 0,
      busy: false,
      resumable: false,
    });

    await addMessages(chat.id, [
      { role: "user", content: "And the next release?" },
    ]);
    expect(
      await (await call(ada, "GET", `/chats/${chat.id}`)).json(),
    ).toMatchObject({
      resumable: true,
    });

    await addMessages(chat.id, [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c3", name: "create_task", arguments: "{}" }],
      },
      {
        role: "tool",
        toolCallId: "c3",
        toolName: "create_task",
        approval: "pending",
      },
    ]);
    expect(
      await (await call(ada, "GET", `/chats/${chat.id}`)).json(),
    ).toMatchObject({
      pendingCount: 1,
      resumable: false,
    });
  });

  it("reports a chat with a running turn as busy, not resumable", async () => {
    const { ada, workspace, call } = await setup();
    const chat = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
      busyUntil: new Date(Date.now() + 60_000),
      busyToken: "running-turn",
    });
    // A question still being answered would otherwise look resumable.
    await addMessages(chat.id, [{ role: "user", content: "Still there?" }]);
    const detail = async () =>
      (await call(ada, "GET", `/chats/${chat.id}`)).json();

    expect(await detail()).toMatchObject({ busy: true, resumable: false });

    // An expired lease is a turn that died: Continue may pick it up.
    await db
      .update(assistantChatTable)
      .set({ busyUntil: new Date(Date.now() - 1000) })
      .where(eq(assistantChatTable.id, chat.id));
    expect(await detail()).toMatchObject({ busy: false, resumable: true });
  });

  it("returns only the latest page of a long chat", async () => {
    const { ada, workspace, call } = await setup();
    const chat = await addChat({ workspaceId: workspace.id, userId: ada.id });
    await addMessages(
      chat.id,
      Array.from({ length: CHAT_MESSAGES_PAGE + 1 }, (_, index) => ({
        role: "user" as const,
        content: `message ${index}`,
      })),
    );

    const detail = (await (
      await call(ada, "GET", `/chats/${chat.id}`)
    ).json()) as {
      messages: { content: string }[];
      hasOlder: boolean;
    };
    expect(detail.hasOlder).toBe(true);
    expect(detail.messages).toHaveLength(CHAT_MESSAGES_PAGE);
    expect(detail.messages[0]?.content).toBe("message 1");
    expect(detail.messages.at(-1)?.content).toBe(
      `message ${CHAT_MESSAGES_PAGE}`,
    );
  });

  it("refuses to delete a chat while a turn holds it", async () => {
    const { ada, workspace, call } = await setup();
    const chat = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
      busyUntil: new Date(Date.now() + 60_000),
      busyToken: "running-turn",
    });
    await addMessages(chat.id, [{ role: "user", content: "Hi" }]);

    await expectError(
      await call(ada, "DELETE", `/chats/${chat.id}`),
      409,
      "ASSISTANT_CHAT_BUSY",
    );
    expect(await chatExists(chat.id)).toBe(true);

    await db
      .update(assistantChatTable)
      .set({ busyUntil: new Date(Date.now() - 1000) })
      .where(eq(assistantChatTable.id, chat.id));
    const response = await call(ada, "DELETE", `/chats/${chat.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(await chatExists(chat.id)).toBe(false);
    const left = await db
      .select()
      .from(assistantMessageTable)
      .where(eq(assistantMessageTable.chatId, chat.id));
    expect(left).toHaveLength(0);
  });
});

describe("chat lease", () => {
  it("lets one holder at a time renew and release it", async () => {
    const { ada, mo, workspace } = await setup();
    const updatedAt = new Date(Date.now() - 3_600_000);
    const chat = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
      updatedAt,
    });
    const owner = {
      chatId: chat.id,
      workspaceId: workspace.id,
      userId: ada.id,
    };

    const { token } = await acquireChatLease(owner);
    await expect(acquireChatLease(owner)).rejects.toMatchObject({
      status: 409,
      code: "ASSISTANT_CHAT_BUSY",
    });
    await expect(
      acquireChatLease({ ...owner, userId: mo.id }),
    ).rejects.toMatchObject({
      status: 404,
      code: "ASSISTANT_CHAT_NOT_FOUND",
    });

    // Taking the lease isn't activity: a request it refuses later must not
    // move the chat up the history.
    const [taken] = await db
      .select()
      .from(assistantChatTable)
      .where(eq(assistantChatTable.id, chat.id));
    expect(taken!.updatedAt.getTime()).toBe(updatedAt.getTime());

    expect(await renewChatLease(chat.id, "someone-else")).toBe(false);
    expect(await renewChatLease(chat.id, token)).toBe(true);
    await releaseChatLease(chat.id, "someone-else");
    await expect(acquireChatLease(owner)).rejects.toMatchObject({
      status: 409,
    });

    await releaseChatLease(chat.id, token);
    const [released] = await db
      .select()
      .from(assistantChatTable)
      .where(eq(assistantChatTable.id, chat.id));
    expect(released).toMatchObject({ busyUntil: null, busyToken: null });
    // Renewing and releasing keep the activity time too.
    expect(released!.updatedAt.getTime()).toBe(updatedAt.getTime());

    const again = await acquireChatLease(owner);
    expect(again.token).not.toBe(token);
    expect(await renewChatLease(chat.id, token)).toBe(false);
  });

  it("moves a chat up only when a turn is touched in", async () => {
    const { ada, workspace } = await setup();
    const updatedAt = new Date(Date.now() - 3_600_000);
    const chat = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
      updatedAt,
    });
    const storedAt = async () =>
      (
        await db
          .select({ updatedAt: assistantChatTable.updatedAt })
          .from(assistantChatTable)
          .where(eq(assistantChatTable.id, chat.id))
      )[0]!.updatedAt.getTime();

    await touchChat(chat.id);
    expect(await storedAt()).toBeGreaterThan(updatedAt.getTime());

    const at = new Date(Date.now() + 5_000);
    await db.transaction((tx) => touchChat(chat.id, tx, at));
    expect(await storedAt()).toBe(at.getTime());
  });

  it("takes over an expired lease", async () => {
    const { ada, workspace } = await setup();
    const chat = await addChat({
      workspaceId: workspace.id,
      userId: ada.id,
      busyUntil: new Date(Date.now() - 1),
      busyToken: "stale",
    });
    const { token } = await acquireChatLease({
      chatId: chat.id,
      workspaceId: workspace.id,
      userId: ada.id,
    });
    expect(token).not.toBe("stale");
  });

  it("creates a chat with its first message, already leased", async () => {
    const { ada, workspace } = await setup();
    const started = await startChat({
      workspaceId: workspace.id,
      userId: ada.id,
      content: "Plan the\nnext release",
    });

    expect(started.chat).toMatchObject({
      workspaceId: workspace.id,
      userId: ada.id,
      title: "Plan the next release",
      busyToken: started.leaseToken,
    });
    expect(started.message).toMatchObject({
      chatId: started.chat.id,
      role: "user",
      content: "Plan the\nnext release",
    });
    const owner = {
      chatId: started.chat.id,
      workspaceId: workspace.id,
      userId: ada.id,
    };
    await expect(acquireChatLease(owner)).rejects.toMatchObject({
      status: 409,
    });
    await releaseChatLease(started.chat.id, started.leaseToken);
    await expect(acquireChatLease(owner)).resolves.toHaveProperty("token");
  });
});

describe("transcript loading", () => {
  const MODEL = "anthropic/claude-sonnet-5.5";
  const step = (callId: string, content: string, calls = [callId]) => [
    {
      role: "assistant" as const,
      content: "",
      model: MODEL,
      toolCalls: calls.map((id) => ({
        id,
        name: "list_projects",
        arguments: "{}",
      })),
    },
    ...calls.map((id) => ({
      role: "tool" as const,
      toolCallId: id,
      toolName: "list_projects",
      content: id === callId ? content : `${content} (${id})`,
    })),
  ];

  it("reads a bounded window that starts at the latest user row", async () => {
    const { ada, workspace } = await setup();
    const chat = await addChat({ workspaceId: workspace.id, userId: ada.id });
    await addMessages(chat.id, [
      { role: "user", content: "Old question" },
      { role: "assistant", content: "Old answer", model: MODEL },
      { role: "user", content: "Keep going" },
    ]);
    // One step of two calls, then two-row steps: the latest rows begin
    // inside that first step, after the latest user row.
    const steps = (TRANSCRIPT_ROWS - 2) / 2;
    await addMessages(chat.id, [
      ...step("first", "r-first", ["first", "second"]),
      ...Array.from({ length: steps }, (_, index) =>
        step(`c${index}`, `r${index}`),
      ).flat(),
    ]);

    const transcript = await loadTranscript(chat.id);
    expect(transcript.length).toBeLessThanOrEqual(TRANSCRIPT_ROWS + 1);
    expect(transcript[0]).toMatchObject({
      role: "user",
      content: "Keep going",
    });
    expect(transcript[1]).toMatchObject({
      role: "assistant",
      toolCalls: [expect.objectContaining({ id: "c0" })],
    });
    expect(transcript.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: `c${steps - 1}`,
      content: `r${steps - 1}`,
    });
    const seqs = transcript.map((row) => row.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));

    const { messages } = buildMessages(transcript, {
      model: MODEL,
      systemPrompt: "System",
    });
    expect(messages[1]).toEqual({ role: "user", content: "Keep going" });
    expect(messages.filter((m) => m.role === "tool")).toHaveLength(steps);
  });

  it("leaves results the window can only stub unread", async () => {
    const { ada, workspace } = await setup();
    const chat = await addChat({ workspaceId: workspace.id, userId: ada.id });
    // Two results fit the window; the third only just doesn't, so it is
    // read but stubbed; the oldest can't be replayed whole at all.
    const size = Math.floor(HISTORY_MAX_CHARS * 0.4);
    const inserted = await addMessages(chat.id, [
      { role: "user", content: "Read everything" },
      ...["a", "b", "c", "d"].flatMap((letter) =>
        step(`call_${letter}`, letter.repeat(size)),
      ),
    ]);
    const toolIds = inserted
      .filter((row) => row.role === "tool")
      .map((row) => row.id);

    const transcript = await loadTranscript(chat.id);
    const tools = transcript.filter((row) => row.role === "tool");
    expect(tools.map((row) => row.id)).toEqual(toolIds);
    expect(tools.map((row) => row.contentOmitted === true)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(tools[0]?.content).toBe("");
    expect(tools[1]?.content).toBe("b".repeat(size));

    const { messages, replayedToolRowIds } = buildMessages(transcript, {
      model: MODEL,
      systemPrompt: "System",
    });
    expect(replayedToolRowIds).toEqual(new Set(toolIds.slice(2)));
    expect(messages.filter((m) => m.role === "tool").length).toBe(4);
  });

  it("is empty for a chat without a user row", async () => {
    const { ada, workspace } = await setup();
    const chat = await addChat({ workspaceId: workspace.id, userId: ada.id });
    await addMessages(chat.id, step("c1", "orphan"));
    expect(await loadTranscript(chat.id)).toEqual([]);
  });
});

describe("daily usage", () => {
  it("counts model calls atomically and stops at the cap", async () => {
    const { ada, workspace } = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const where = and(
      eq(assistantUsageTable.workspaceId, workspace.id),
      eq(assistantUsageTable.userId, ada.id),
      eq(assistantUsageTable.day, today),
    );

    await checkDailyAllowance(workspace.id, ada.id);
    expect(await reserveModelCall(workspace.id, ada.id)).toBe(true);
    await recordUsage(workspace.id, ada.id, {
      promptTokens: 1200,
      completionTokens: 80,
      costUsd: 0.004,
    });
    await recordUsage(workspace.id, ada.id, {
      promptTokens: 300,
      completionTokens: 20,
    });
    expect(await db.select().from(assistantUsageTable).where(where)).toEqual([
      expect.objectContaining({
        modelCalls: 1,
        promptTokens: 1500,
        completionTokens: 100,
        costUsd: 0.004,
      }),
    ]);

    await db
      .update(assistantUsageTable)
      .set({ modelCalls: DAILY_MODEL_CALLS_PER_USER - 2 })
      .where(where);
    const reserved = await Promise.all(
      Array.from({ length: 4 }, () => reserveModelCall(workspace.id, ada.id)),
    );
    expect(reserved.filter(Boolean)).toHaveLength(2);
    const [row] = await db.select().from(assistantUsageTable).where(where);
    expect(row?.modelCalls).toBe(DAILY_MODEL_CALLS_PER_USER);

    const refused = await checkDailyAllowance(workspace.id, ada.id).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).toMatchObject({
      status: 429,
      code: "ASSISTANT_DAILY_LIMIT",
    });
  });
});
