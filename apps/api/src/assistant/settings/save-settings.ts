import { eq } from "drizzle-orm";
import db from "../../database";
import { workspaceAssistantSettingTable } from "../../database/schema";
import { assistantError, openRouterRequestError } from "../errors";
import { getOpenRouterKeyInfo } from "../openrouter/get-key-info";
import { resolveSupportedModel } from "../openrouter/list-tool-models";
import { OpenRouterError } from "../openrouter/openrouter-error";
import type { AssistantSettings } from "../response";
import type { UpdateAssistantSettingsInput } from "../schema";
import { sealAssistantKey } from "./assistant-key-box";
import { getAssistantSettings } from "./get-settings";
import { loadAssistantConfig } from "./load-assistant-config";

// A list that cannot be loaded doesn't block saving; the model is then
// accepted unchecked and the response says so.
async function checkModel(
  requested: string,
): Promise<{ model: string; modelUnverified: boolean }> {
  let model: string | null;
  try {
    model = await resolveSupportedModel(requested);
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return { model: requested, modelUnverified: true };
    }
    throw error;
  }
  if (model === null) throw assistantError("ASSISTANT_MODEL_UNSUPPORTED");
  return { model, modelUnverified: false };
}

/**
 * Saves the workspace's OpenRouter key and model. A new key is checked with
 * OpenRouter before it is sealed and stored; without one, the saved key is
 * kept and must still be readable. A new key clears the last provider error;
 * without one the error stays until a model call succeeds.
 */
export async function saveAssistantSettings(
  workspaceId: string,
  userId: string,
  input: UpdateAssistantSettingsInput,
): Promise<AssistantSettings> {
  const apiKey = input.apiKey?.trim() || undefined;
  if (apiKey) {
    await getOpenRouterKeyInfo(apiKey).catch((error: unknown) => {
      throw openRouterRequestError(error);
    });
  } else if ((await loadAssistantConfig(workspaceId)).state !== "ready") {
    throw assistantError("OPENROUTER_KEY_REQUIRED");
  }
  const { model, modelUnverified } = await checkModel(input.model);

  const table = workspaceAssistantSettingTable;
  const changes = {
    model,
    ...(input.allowDataCollection === undefined
      ? {}
      : { allowDataCollection: input.allowDataCollection }),
    updatedByUserId: userId,
    updatedAt: new Date(),
  };
  if (apiKey) {
    const key = {
      apiKeyCiphertext: sealAssistantKey(workspaceId, apiKey),
      apiKeyHint: `…${apiKey.slice(-4)}`,
      lastErrorCode: null,
      lastErrorAt: null,
    };
    await db
      .insert(table)
      .values({ workspaceId, ...key, ...changes })
      .onConflictDoUpdate({
        target: table.workspaceId,
        set: { ...key, ...changes },
      });
  } else {
    const updated = await db
      .update(table)
      .set(changes)
      .where(eq(table.workspaceId, workspaceId))
      .returning({ workspaceId: table.workspaceId });
    // The key was removed while this request ran.
    if (updated.length === 0) throw assistantError("OPENROUTER_KEY_REQUIRED");
  }

  const settings = await getAssistantSettings(workspaceId);
  return modelUnverified ? { ...settings, modelUnverified } : settings;
}
