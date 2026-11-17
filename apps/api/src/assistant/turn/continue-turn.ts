import { and, count, desc, eq } from "drizzle-orm";
import db from "../../database";
import { assistantMessageTable } from "../../database/schema";
import { acquireChatLease } from "../chats/chat-lease";
import { touchChat } from "../chats/touch-chat";
import { assistantError } from "../errors";
import type { AssistantContinueInput } from "../schema";
import { isResumable } from "./is-resumable";
import {
  type AssistantContext,
  prepareTurn,
  releaseLeaseAfterFailure,
  streamChatTurn,
  takeTurnSlot,
} from "./turn-context";
import type { TurnSlot } from "./turn-slots";

const messages = assistantMessageTable;

/**
 * 409 unless the chat can be picked up: ASSISTANT_PENDING_APPROVALS while a
 * proposal waits, ASSISTANT_NOTHING_TO_CONTINUE when the transcript already
 * ends in an answer. Checked under the lease, so no turn changes it meanwhile.
 */
async function assertResumable(chatId: string) {
  const [pending] = await db
    .select({ count: count() })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.approval, "pending")));
  if ((pending?.count ?? 0) > 0) {
    throw assistantError("ASSISTANT_PENDING_APPROVALS");
  }
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
  if (!isResumable(last, 0)) {
    throw assistantError("ASSISTANT_NOTHING_TO_CONTINUE");
  }
}

/**
 * POST /chats/{chatId}/continue: runs the loop again on the existing
 * transcript, after tool results, Stop, a failed call or decided proposals.
 * It adds no message of its own.
 */
export async function continueTurn(
  c: AssistantContext,
  chatId: string,
  body: AssistantContinueInput,
): Promise<Response> {
  const owner = {
    chatId,
    workspaceId: c.get("workspaceId"),
    userId: c.get("userId"),
  };
  const setup = await prepareTurn(c);
  const { token } = await acquireChatLease(owner);

  let slot: TurnSlot | null = null;
  try {
    await assertResumable(chatId);
    slot = takeTurnSlot(owner.userId);
    await touchChat(chatId);
    return streamChatTurn(c, {
      setup,
      chatId,
      leaseToken: token,
      slot,
      timeZone: body.timeZone,
    });
  } catch (error) {
    slot?.release();
    await releaseLeaseAfterFailure(chatId, token);
    throw error;
  }
}
