import { setTimeout as sleep } from "node:timers/promises";
import { withoutOutboundTelemetry } from "../../utils/sensitive-outbound";
import {
  OPENROUTER_BASE,
  OPENROUTER_REFERER,
  OPENROUTER_TITLE,
  RECOMMENDED_MODELS,
} from "../constants";
import type { AssistantModel } from "../response";
import { OpenRouterError } from "./openrouter-error";
import {
  type ModelLimits,
  parseToolModels,
  resolveToolModel,
  type ToolModelCatalog,
  toolModelLimits,
} from "./parse-tool-models";
import { readJsonResponse } from "./read-json-response";

const CACHE_MS = 60 * 60 * 1000;
const MODELS_TIMEOUT_MS = 15_000;
const MAX_MODELS_RESPONSE_BYTES = 16 * 1024 * 1024;

// A turn never waits long for limits: without them it asks for the default.
const LIMITS_WAIT_MS = 2_000;
const LIMITS_RETRY_MS = 60_000;

let cached: { catalog: ToolModelCatalog; expiresAt: number } | null = null;
let loading: Promise<ToolModelCatalog> | null = null;
let limitsUnknownUntil = 0;

async function fetchCatalog(): Promise<ToolModelCatalog> {
  let response: Response;
  try {
    // The model list is public, so no key is sent.
    response = await withoutOutboundTelemetry(() =>
      fetch(`${OPENROUTER_BASE}/models?supported_parameters=tools`, {
        method: "GET",
        headers: {
          "HTTP-Referer": OPENROUTER_REFERER,
          "X-OpenRouter-Title": OPENROUTER_TITLE,
        },
        redirect: "error",
        signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
      }),
    );
  } catch {
    throw new OpenRouterError("OPENROUTER_UNREACHABLE");
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new OpenRouterError("OPENROUTER_UNREACHABLE", {
      status: response.status,
    });
  }
  return parseToolModels(
    await readJsonResponse(response, MAX_MODELS_RESPONSE_BYTES),
    new Date(),
    RECOMMENDED_MODELS,
  );
}

// One request at a time fills the cache; a failure is not cached.
async function loadCatalog(): Promise<ToolModelCatalog> {
  if (cached && cached.expiresAt > Date.now()) return cached.catalog;
  loading ??= fetchCatalog()
    .then((catalog) => {
      cached = { catalog, expiresAt: Date.now() + CACHE_MS };
      return catalog;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/**
 * OpenRouter models that serve tool calls through chat completions, cached
 * for an hour. Throws OpenRouterError OPENROUTER_UNREACHABLE when the list
 * cannot be loaded.
 */
export async function listToolModels(): Promise<AssistantModel[]> {
  return (await loadCatalog()).models;
}

/**
 * The base id when `id` or its canonical slug is a listed tool model, else
 * null. Throws like listToolModels when the list cannot be loaded.
 */
export async function resolveSupportedModel(
  id: string,
): Promise<string | null> {
  return resolveToolModel(await loadCatalog(), id);
}

/**
 * The token limits OpenRouter lists for `id`, or null when they are unknown:
 * the model isn't listed, or the list can't be had quickly. Never throws.
 * An expired list still answers while a fresh one loads in the background;
 * without any list, a turn waits at most LIMITS_WAIT_MS, and after a failed
 * load the limits count as unknown for a minute.
 */
export async function getModelLimits(id: string): Promise<ModelLimits | null> {
  const stale = cached?.catalog;
  if (stale) {
    if ((cached?.expiresAt ?? 0) <= Date.now()) {
      void loadCatalog().catch(() => {});
    }
    return toolModelLimits(stale, id);
  }
  if (Date.now() < limitsUnknownUntil) return null;
  try {
    const catalog = await Promise.race([
      loadCatalog(),
      sleep(LIMITS_WAIT_MS, null, { ref: false }),
    ]);
    return catalog ? toolModelLimits(catalog, id) : null;
  } catch {
    limitsUnknownUntil = Date.now() + LIMITS_RETRY_MS;
    return null;
  }
}

/** Tests only: forget the cached list. */
export function resetToolModelsCache() {
  cached = null;
  loading = null;
  limitsUnknownUntil = 0;
}
