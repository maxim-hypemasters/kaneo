import { eq } from "drizzle-orm";
import db from "../../database";
import { workspaceAssistantSettingTable } from "../../database/schema";
import { assistantError } from "../errors";
import { openAssistantKey } from "./assistant-key-box";

export type AssistantConfig =
  | {
      state: "ready";
      apiKey: string;
      /** Identifies the stored key for recordProviderError; never expose it. */
      keyCiphertext: string;
      model: string;
      allowDataCollection: boolean;
      lastErrorCode: string | null;
    }
  | { state: "not_configured" }
  | { state: "unreadable"; model: string };

export type ReadyAssistantConfig = Extract<AssistantConfig, { state: "ready" }>;

/**
 * The workspace's assistant configuration with the decrypted key. Together
 * with save-settings, this is the only reader of api_key_ciphertext; the key
 * it returns must never reach a response, log or event.
 */
export async function loadAssistantConfig(
  workspaceId: string,
): Promise<AssistantConfig> {
  const table = workspaceAssistantSettingTable;
  const [row] = await db
    .select({
      apiKeyCiphertext: table.apiKeyCiphertext,
      model: table.model,
      allowDataCollection: table.allowDataCollection,
      lastErrorCode: table.lastErrorCode,
    })
    .from(table)
    .where(eq(table.workspaceId, workspaceId))
    .limit(1);
  if (!row) return { state: "not_configured" };

  const apiKey = openAssistantKey(workspaceId, row.apiKeyCiphertext);
  if (apiKey === null) return { state: "unreadable", model: row.model };
  return {
    state: "ready",
    apiKey,
    keyCiphertext: row.apiKeyCiphertext,
    model: row.model,
    allowDataCollection: row.allowDataCollection,
    lastErrorCode: row.lastErrorCode,
  };
}

/** Throws 409 ASSISTANT_NOT_CONFIGURED or ASSISTANT_KEY_UNREADABLE. */
export async function requireReadyConfig(
  workspaceId: string,
): Promise<ReadyAssistantConfig> {
  const config = await loadAssistantConfig(workspaceId);
  if (config.state === "not_configured") {
    throw assistantError("ASSISTANT_NOT_CONFIGURED");
  }
  if (config.state === "unreadable") {
    throw assistantError("ASSISTANT_KEY_UNREADABLE");
  }
  return config;
}
