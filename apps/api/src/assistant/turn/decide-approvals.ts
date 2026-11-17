import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import db from "../../database";
import { assistantMessageTable, workspaceTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import { ASSISTANT_WORKSPACE_HEADER } from "../../utils/assistant-workspace-pin";
import { InternalApiClient } from "../../utils/internal-api-client";
import { internalApiUrl } from "../../utils/internal-api-url";
import {
  acquireChatLease,
  type ChatOwner,
  releaseChatLease,
  renewChatLease,
} from "../chats/chat-lease";
import { toAssistantMessageDto } from "../chats/message-response";
import { touchChat } from "../chats/touch-chat";
import {
  DECISIONS_BUDGET_MS,
  READ_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
} from "../constants";
import { assistantError } from "../errors";
import type { AssistantDecisionsInput } from "../proposals/decisions-body";
import {
  APPROVED_OUTCOME_UNKNOWN,
  type ExecutionDeps,
  executeApproved,
} from "../proposals/execute-approved";
import type { AssistantDecisionsResult } from "../response";
import { createAssistantTools } from "../tools/assistant-tools";
import { loopbackLimiter } from "../tools/loopback-limiter";
import { isResumable } from "./is-resumable";
import type { AssistantContext } from "./turn-context";
import type { MessageRow } from "./turn-messages";

const messages = assistantMessageTable;

export const REJECTED_BY_USER =
  "The user rejected this action. Do not retry it unless asked.";

export type DecideApprovalsInput = {
  owner: ChatOwner;
  /** The approver's session token: approved changes run as them. */
  token: string;
  decisions: AssistantDecisionsInput["decisions"];
};

export type DecideApprovalsOptions = {
  /**
   * Start no write after this long; the rest stay pending. The first
   * approved row always runs, so a request decides something.
   */
  budgetMs?: number;
  now?: () => number;
};

async function executionDeps(
  owner: ChatOwner,
  token: string,
): Promise<ExecutionDeps> {
  const [workspace] = await db
    .select({ slug: workspaceTable.slug })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, owner.workspaceId))
    .limit(1);
  const client = (readOnly: boolean) =>
    new InternalApiClient({
      baseUrl: internalApiUrl,
      token,
      extraHeaders: { [ASSISTANT_WORKSPACE_HEADER]: owner.workspaceId },
      readOnly,
      timeoutMs: readOnly ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS,
      limiter: loopbackLimiter,
    });
  const writeClient = client(false);
  return {
    tools: createAssistantTools({
      workspaceId: owner.workspaceId,
      // Nothing here relies on `permitted`: the API checks the approver's
      // permissions when each write runs.
      can: () => true,
      client: writeClient,
      mode: "write",
    }),
    writeClient,
    readClient: client(true),
    workspace: { id: owner.workspaceId, slug: workspace?.slug ?? "" },
  };
}

function rejectPending(chatId: string, ids: string[]): Promise<MessageRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return db
    .update(messages)
    .set({
      approval: "rejected",
      content: REJECTED_BY_USER,
      decidedAt: new Date(),
    })
    .where(
      and(
        eq(messages.chatId, chatId),
        inArray(messages.id, ids),
        eq(messages.approval, "pending"),
      ),
    )
    .returning();
}

async function pendingInOrder(chatId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        inArray(messages.id, ids),
        eq(messages.approval, "pending"),
      ),
    )
    .orderBy(asc(messages.seq));
}

// Only one request can move a row out of pending, so a double click or a
// second tab never runs a change twice.
async function claimApproval(
  chatId: string,
  id: string,
): Promise<MessageRow | null> {
  const [claimed] = await db
    .update(messages)
    .set({
      approval: "approved",
      content: APPROVED_OUTCOME_UNKNOWN,
      decidedAt: new Date(),
    })
    .where(
      and(
        eq(messages.id, id),
        eq(messages.chatId, chatId),
        eq(messages.approval, "pending"),
      ),
    )
    .returning();
  return claimed ?? null;
}

// A claimed row whose write never started goes back to waiting.
async function unclaimApproval(chatId: string, id: string): Promise<void> {
  await db
    .update(messages)
    .set({ approval: "pending", content: "", decidedAt: null })
    .where(
      and(
        eq(messages.id, id),
        eq(messages.chatId, chatId),
        eq(messages.approval, "approved"),
      ),
    );
}

async function chatState(chatId: string) {
  const [pending] = await db
    .select({ count: count() })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.approval, "pending")));
  const last = await db
    .select({
      role: messages.role,
      status: messages.status,
      toolCalls: messages.toolCalls,
    })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(desc(messages.seq))
    .limit(1);
  const pendingCount = pending?.count ?? 0;
  return { pendingCount, resumable: isResumable(last, pendingCount) };
}

/**
 * Decides proposals in one of the caller's chats under its lease: rejected
 * rows in one claim, then approved rows one at a time in the order they were
 * proposed, each run as the approver right after its claim. The budget is
 * checked before each claim and again right before each write, and the
 * lease is renewed after each row; once either runs out, the rest stay
 * pending. Ids of other chats, or of rows no longer pending, are ignored;
 * when nothing was claimed it is 409 ASSISTANT_NOTHING_PENDING.
 */
export async function decideApprovalsAs(
  input: DecideApprovalsInput,
  options: DecideApprovalsOptions = {},
): Promise<AssistantDecisionsResult> {
  const { owner } = input;
  const budgetMs = options.budgetMs ?? DECISIONS_BUDGET_MS;
  const now = options.now ?? Date.now;
  const lease = await acquireChatLease(owner);
  try {
    const started = now();
    const rejected = await rejectPending(
      owner.chatId,
      input.decisions.filter((d) => !d.approve).map((d) => d.messageId),
    );
    const candidates = await pendingInOrder(
      owner.chatId,
      input.decisions.filter((d) => d.approve).map((d) => d.messageId),
    );

    const approved: MessageRow[] = [];
    const inTime = () => approved.length === 0 || now() - started < budgetMs;
    let deps: ExecutionDeps | null = null;
    for (const candidate of candidates) {
      if (!inTime()) break;
      const claimed = await claimApproval(owner.chatId, candidate.id);
      if (!claimed) continue;
      await touchChat(owner.chatId);
      deps ??= {
        ...(await executionDeps(owner, input.token)),
        mayWrite: inTime,
      };
      const outcome = await executeApproved(claimed, deps);
      if (!outcome) {
        await unclaimApproval(owner.chatId, claimed.id);
        break;
      }
      const [saved] = await db
        .update(messages)
        .set(outcome)
        .where(eq(messages.id, claimed.id))
        .returning();
      approved.push(saved ?? claimed);
      if (!(await renewChatLease(owner.chatId, lease.token))) break;
    }

    if (rejected.length === 0 && approved.length === 0)
      throw assistantError("ASSISTANT_NOTHING_PENDING");
    const decided = [...rejected, ...approved].sort((a, b) => a.seq - b.seq);
    return {
      messages: decided.map(toAssistantMessageDto),
      ...(await chatState(owner.chatId)),
    };
  } finally {
    await releaseChatLease(owner.chatId, lease.token).catch(() => {});
  }
}

/** POST /chats/{chatId}/decisions, as the signed-in caller. */
export async function decideApprovals(
  c: AssistantContext,
  chatId: string,
  body: AssistantDecisionsInput,
): Promise<AssistantDecisionsResult> {
  const token = c.get("session")?.token;
  if (!token) {
    throw new ApiError(403, {
      message: "A user session is required",
      code: "SESSION_REQUIRED",
    });
  }
  return decideApprovalsAs({
    owner: {
      chatId,
      workspaceId: c.get("workspaceId"),
      userId: c.get("userId"),
    },
    token,
    decisions: body.decisions,
  });
}
