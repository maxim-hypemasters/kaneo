import type { AssistantModel } from "../response";
import { OpenRouterError } from "./openrouter-error";

export const MAX_TOOL_MODELS = 2_000;
const CHAT_COMPLETIONS_PATH = "/api/v1/chat/completions";

/** What a request to a model may use, in tokens; null when not listed. */
export type ModelLimits = {
  contextLength: number | null;
  maxCompletionTokens: number | null;
};

/**
 * Tool-capable models, plus canonical slugs mapped to their base ids, and
 * each model's token limits by base id. The limits stay on the server.
 */
export type ToolModelCatalog = {
  models: AssistantModel[];
  aliases: Map<string, string>;
  limits: Map<string, ModelLimits>;
};

type Entry = Record<string, unknown>;

function isRecord(value: unknown): value is Entry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : null;
}

function isExpired(entry: Entry, now: Date): boolean {
  if (typeof entry.expiration_date !== "string") return false;
  const expiresAt = Date.parse(entry.expiration_date);
  return !Number.isNaN(expiresAt) && expiresAt <= now.getTime();
}

// The endpoint list's shape isn't fixed, so only a list naming paths can
// exclude a model.
function servesChatCompletions(entry: Entry): boolean {
  if (!Array.isArray(entry.endpoints)) return true;
  const paths = entry.endpoints
    .map((endpoint) =>
      typeof endpoint === "string"
        ? endpoint
        : isRecord(endpoint) && typeof endpoint.path === "string"
          ? endpoint.path
          : null,
    )
    .filter((path): path is string => path !== null);
  return paths.length === 0 || paths.includes(CHAT_COMPLETIONS_PATH);
}

function isToolChatModel(entry: Entry, now: Date): boolean {
  const id = entry.id;
  if (typeof id !== "string" || id === "" || id.endsWith(":batch")) {
    return false;
  }
  if (isExpired(entry, now) || !servesChatCompletions(entry)) return false;
  const parameters = strings(entry.supported_parameters);
  if (parameters && !parameters.includes("tools")) return false;
  const architecture = isRecord(entry.architecture) ? entry.architecture : {};
  const outputs = strings(architecture.output_modalities);
  return !outputs || outputs.includes("text");
}

/** USD per token as a string → USD per million tokens; null when variable. */
export function perMillionTokens(price: unknown): number | null {
  const perToken =
    typeof price === "string" || typeof price === "number"
      ? Number(price)
      : Number.NaN;
  if (!Number.isFinite(perToken) || perToken < 0) return null;
  return Math.round(perToken * 1e12) / 1e6;
}

const topProvider = (entry: Entry): Entry =>
  isRecord(entry.top_provider) ? entry.top_provider : {};

function contextLength(entry: Entry): number {
  for (const value of [
    entry.context_length,
    topProvider(entry).context_length,
  ]) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
  }
  return 0;
}

const positiveInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;

function toLimits(entry: Entry, model: AssistantModel): ModelLimits {
  return {
    contextLength: positiveInteger(model.contextLength),
    maxCompletionTokens: positiveInteger(
      topProvider(entry).max_completion_tokens,
    ),
  };
}

function toModel(entry: Entry, recommended: readonly string[]): AssistantModel {
  const id = entry.id as string;
  const pricing = isRecord(entry.pricing) ? entry.pricing : {};
  return {
    id,
    name:
      typeof entry.name === "string" && entry.name.trim() !== ""
        ? entry.name
        : id,
    contextLength: contextLength(entry),
    promptPerMTokUsd: perMillionTokens(pricing.prompt),
    completionPerMTokUsd: perMillionTokens(pricing.completion),
    recommended: recommended.includes(id),
  };
}

function compareModels(recommended: readonly string[]) {
  const rank = (model: AssistantModel) =>
    model.recommended ? recommended.indexOf(model.id) : recommended.length;
  return (a: AssistantModel, b: AssistantModel) =>
    rank(a) - rank(b) ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id);
}

/**
 * Keeps OpenRouter models that serve tool calls through chat completions:
 * not ":batch", not expired, with text output. Recommended models come first,
 * then by name, capped at MAX_TOOL_MODELS. Each kept model's context length
 * and top provider's max_completion_tokens go in `limits`. A payload without
 * a `data` list is an OPENROUTER_UNREACHABLE error.
 */
export function parseToolModels(
  payload: unknown,
  now: Date,
  recommended: readonly string[],
): ToolModelCatalog {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new OpenRouterError("OPENROUTER_UNREACHABLE");
  }
  const byId = new Map<string, AssistantModel>();
  const aliases = new Map<string, string>();
  const limits = new Map<string, ModelLimits>();
  for (const entry of payload.data) {
    if (!isRecord(entry) || !isToolChatModel(entry, now)) continue;
    const model = toModel(entry, recommended);
    if (byId.has(model.id)) continue;
    byId.set(model.id, model);
    limits.set(model.id, toLimits(entry, model));
    const slug = entry.canonical_slug;
    if (typeof slug === "string" && slug !== "" && slug !== model.id) {
      aliases.set(slug, model.id);
    }
  }
  const models = [...byId.values()]
    .sort(compareModels(recommended))
    .slice(0, MAX_TOOL_MODELS);
  const kept = new Set(models.map((model) => model.id));
  for (const [slug, id] of aliases) {
    if (!kept.has(id) || kept.has(slug)) aliases.delete(slug);
  }
  for (const id of limits.keys()) {
    if (!kept.has(id)) limits.delete(id);
  }
  return { models, aliases, limits };
}

/** The base id for `id` or its canonical slug, or null when not offered. */
export function resolveToolModel(
  catalog: ToolModelCatalog,
  id: string,
): string | null {
  if (catalog.models.some((model) => model.id === id)) return id;
  return catalog.aliases.get(id) ?? null;
}

/** The token limits of `id` or its canonical slug, or null when not listed. */
export function toolModelLimits(
  catalog: ToolModelCatalog,
  id: string,
): ModelLimits | null {
  const base = resolveToolModel(catalog, id);
  return base === null ? null : (catalog.limits.get(base) ?? null);
}
