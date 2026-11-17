import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import db from "../../database";
import { assistantChatTable } from "../../database/schema";
import { LEASE_MS } from "../constants";
import { assistantError } from "../errors";

const chats = assistantChatTable;

export type ChatOwner = { chatId: string; workspaceId: string; userId: string };

// Lease times are JS Dates bound through the column, never a bare now(),
// which Postgres would read in the session time zone.
const leaseEnd = (now: Date) => new Date(now.getTime() + LEASE_MS);

/**
 * Takes the chat's turn lease for its owner, so only one turn (or delete)
 * runs per chat. Throws 404 ASSISTANT_CHAT_NOT_FOUND when the chat isn't
 * the caller's in this workspace, and 409 ASSISTANT_CHAT_BUSY while another
 * unexpired lease holds it. Taking it keeps updated_at: a request refused
 * after the lease isn't activity. touchChat marks what really is.
 */
export async function acquireChatLease(
  owner: ChatOwner,
  now: Date = new Date(),
): Promise<{ token: string }> {
  const token = createId();
  const owned = and(
    eq(chats.id, owner.chatId),
    eq(chats.workspaceId, owner.workspaceId),
    eq(chats.userId, owner.userId),
  );
  const [taken] = await db
    .update(chats)
    .set({
      busyUntil: leaseEnd(now),
      busyToken: token,
      updatedAt: sql`${chats.updatedAt}`,
    })
    .where(and(owned, or(isNull(chats.busyUntil), lt(chats.busyUntil, now))))
    .returning({ id: chats.id });
  if (taken) return { token };

  const [exists] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(owned)
    .limit(1);
  throw assistantError(
    exists ? "ASSISTANT_CHAT_BUSY" : "ASSISTANT_CHAT_NOT_FOUND",
  );
}

/**
 * Extends a lease this token still holds, keeping updated_at. Returns false
 * when the lease was lost (released, or expired and taken by another).
 */
export async function renewChatLease(
  chatId: string,
  token: string,
  now: Date = new Date(),
): Promise<boolean> {
  const renewed = await db
    .update(chats)
    .set({ busyUntil: leaseEnd(now), updatedAt: sql`${chats.updatedAt}` })
    .where(and(eq(chats.id, chatId), eq(chats.busyToken, token)))
    .returning({ id: chats.id });
  return renewed.length > 0;
}

/** Releases the lease only if this token still holds it; keeps updated_at. */
export async function releaseChatLease(
  chatId: string,
  token: string,
): Promise<void> {
  await db
    .update(chats)
    .set({
      busyUntil: null,
      busyToken: null,
      updatedAt: sql`${chats.updatedAt}`,
    })
    .where(and(eq(chats.id, chatId), eq(chats.busyToken, token)));
}
