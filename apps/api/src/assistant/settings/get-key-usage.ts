import { createHash } from "node:crypto";
import { openRouterRequestError } from "../errors";
import { getOpenRouterKeyInfo } from "../openrouter/get-key-info";
import { OpenRouterError } from "../openrouter/openrouter-error";
import type { AssistantKeyUsage } from "../response";
import { requireReadyConfig } from "./load-assistant-config";
import { recordProviderError } from "./record-provider-error";

const USAGE_CACHE_MS = 60_000;
const MAX_CACHED_WORKSPACES = 1_000;

// Keyed by workspace and a hash of the key, so a replaced key is never
// answered from the old key's entry, on this instance or any other.
const cache = new Map<
  string,
  { keyHash: string; usage: AssistantKeyUsage; expiresAt: number }
>();

function remember(
  workspaceId: string,
  keyHash: string,
  usage: AssistantKeyUsage,
) {
  const now = Date.now();
  cache.delete(workspaceId);
  if (cache.size >= MAX_CACHED_WORKSPACES) {
    for (const [id, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(id);
    }
    const oldest = cache.keys().next();
    if (cache.size >= MAX_CACHED_WORKSPACES && !oldest.done) {
      cache.delete(oldest.value);
    }
  }
  cache.set(workspaceId, { keyHash, usage, expiresAt: now + USAGE_CACHE_MS });
}

/**
 * The saved key's credit usage from OpenRouter, cached for 60 seconds.
 * Throws 409 when no readable key is saved, 400 OPENROUTER_KEY_INVALID when
 * OpenRouter rejects it (and records that), and 502 when unreachable.
 */
export async function getAssistantKeyUsage(
  workspaceId: string,
): Promise<AssistantKeyUsage> {
  const { apiKey, keyCiphertext } = await requireReadyConfig(workspaceId);
  const keyHash = createHash("sha256").update(apiKey).digest("base64url");
  const hit = cache.get(workspaceId);
  if (hit && hit.keyHash === keyHash && hit.expiresAt > Date.now()) {
    return hit.usage;
  }

  let usage: AssistantKeyUsage;
  try {
    usage = await getOpenRouterKeyInfo(apiKey);
  } catch (error) {
    if (
      error instanceof OpenRouterError &&
      error.code === "OPENROUTER_KEY_INVALID"
    ) {
      await recordProviderError(
        workspaceId,
        "OPENROUTER_KEY_INVALID",
        keyCiphertext,
      );
    }
    throw openRouterRequestError(error);
  }
  remember(workspaceId, keyHash, usage);
  return usage;
}

/** Tests only: forget cached usage. */
export function resetKeyUsageCache() {
  cache.clear();
}
