import { eq } from "drizzle-orm";
import db from "../../database";
import { workspaceAssistantSettingTable } from "../../database/schema";
import type { AssistantSettings } from "../response";
import { toAssistantSettings } from "./to-assistant-settings";

/** Removes the key and model. Chats stay; the assistant is unavailable. */
export async function deleteAssistantSettings(
  workspaceId: string,
): Promise<AssistantSettings> {
  await db
    .delete(workspaceAssistantSettingTable)
    .where(eq(workspaceAssistantSettingTable.workspaceId, workspaceId));
  return toAssistantSettings(null, false);
}
