/**
 * Where a page of the chat list ended. `updatedAt` is the database's own
 * microsecond text (YYYY-MM-DDTHH:MM:SS.ffffff, UTC), because a JS Date
 * would round it to milliseconds and skip chats on the next page.
 */
export type ChatCursor = { updatedAt: string; id: string };

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

function isRealTimestamp(value: string): boolean {
  if (!TIMESTAMP.test(value)) return false;
  // Date rolls 2026-02-30 over to March; a round trip catches that.
  const millis = `${value.slice(0, 23)}Z`;
  const date = new Date(millis);
  return !Number.isNaN(date.getTime()) && date.toISOString() === millis;
}

/** An opaque cursor for the `before` query parameter. */
export function encodeChatCursor(cursor: ChatCursor): string {
  return Buffer.from(JSON.stringify([cursor.updatedAt, cursor.id])).toString(
    "base64url",
  );
}

/** The cursor in `value`, or null for anything this API didn't issue. */
export function decodeChatCursor(value: string): ChatCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [updatedAt, id] = parsed;
    if (typeof updatedAt !== "string" || !isRealTimestamp(updatedAt)) {
      return null;
    }
    if (typeof id !== "string" || !ID.test(id)) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}
