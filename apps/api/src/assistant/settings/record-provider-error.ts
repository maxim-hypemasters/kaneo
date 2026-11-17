import { and, eq, isNotNull, sql } from "drizzle-orm";
import db from "../../database";
import { workspaceAssistantSettingTable } from "../../database/schema";

export type ProviderErrorCode = "OPENROUTER_KEY_INVALID" | "OPENROUTER_CREDITS";

const table = workspaceAssistantSettingTable;
// updated_at records the last admin save, so a provider error keeps it.
const keepUpdatedAt = sql`${table.updatedAt}`;

/**
 * Remembers that OpenRouter rejected the key or found it out of credits.
 * keyCiphertext is the stored key the failing request used, so a key an admin
 * replaced meanwhile is not marked.
 */
export async function recordProviderError(
  workspaceId: string,
  code: ProviderErrorCode,
  keyCiphertext: string,
) {
  await db
    .update(table)
    .set({
      lastErrorCode: code,
      lastErrorAt: new Date(),
      updatedAt: keepUpdatedAt,
    })
    .where(
      and(
        eq(table.workspaceId, workspaceId),
        eq(table.apiKeyCiphertext, keyCiphertext),
      ),
    );
}

export async function clearProviderError(
  workspaceId: string,
  keyCiphertext: string,
) {
  await db
    .update(table)
    .set({ lastErrorCode: null, lastErrorAt: null, updatedAt: keepUpdatedAt })
    .where(
      and(
        eq(table.workspaceId, workspaceId),
        eq(table.apiKeyCiphertext, keyCiphertext),
        isNotNull(table.lastErrorCode),
      ),
    );
}
