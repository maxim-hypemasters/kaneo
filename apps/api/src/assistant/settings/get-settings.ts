import { eq } from "drizzle-orm";
import db from "../../database";
import {
  userTable,
  workspaceAssistantSettingTable,
} from "../../database/schema";
import type { AssistantSettings } from "../response";
import { loadAssistantConfig } from "./load-assistant-config";
import { toAssistantSettings } from "./to-assistant-settings";

/** The workspace's assistant settings for admins, without the key. */
export async function getAssistantSettings(
  workspaceId: string,
): Promise<AssistantSettings> {
  const table = workspaceAssistantSettingTable;
  const [row] = await db
    .select({
      apiKeyHint: table.apiKeyHint,
      model: table.model,
      allowDataCollection: table.allowDataCollection,
      lastErrorCode: table.lastErrorCode,
      lastErrorAt: table.lastErrorAt,
      updatedAt: table.updatedAt,
      updatedById: userTable.id,
      updatedByName: userTable.name,
    })
    .from(table)
    .leftJoin(userTable, eq(userTable.id, table.updatedByUserId))
    .where(eq(table.workspaceId, workspaceId))
    .limit(1);
  if (!row) return toAssistantSettings(null, false);

  // Opening the key is the only way to tell whether it is still readable.
  const config = await loadAssistantConfig(workspaceId);
  if (config.state === "not_configured")
    return toAssistantSettings(null, false);

  const { updatedById, updatedByName, ...stored } = row;
  return toAssistantSettings(
    {
      ...stored,
      updatedBy:
        updatedById && updatedByName !== null
          ? { id: updatedById, name: updatedByName }
          : null,
    },
    config.state === "ready",
  );
}
