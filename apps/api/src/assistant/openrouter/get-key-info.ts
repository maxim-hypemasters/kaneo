import { z } from "zod";
import { withoutOutboundTelemetry } from "../../utils/sensitive-outbound";
import {
  OPENROUTER_BASE,
  OPENROUTER_REFERER,
  OPENROUTER_TITLE,
} from "../constants";
import { OpenRouterError } from "./openrouter-error";
import { readJsonResponse } from "./read-json-response";
import type { OpenRouterKeyInfo } from "./types";

const KEY_TIMEOUT_MS = 10_000;
const MAX_KEY_RESPONSE_BYTES = 64 * 1024;

const keyPayload = z.object({
  data: z.object({
    usage: z.number(),
    limit: z.number().nullable().optional(),
    limit_remaining: z.number().nullable().optional(),
    is_free_tier: z.boolean().optional(),
  }),
});

/** Maps OpenRouter's GET /key payload; a malformed one is unreachable. */
export function parseKeyInfo(payload: unknown): OpenRouterKeyInfo {
  const parsed = keyPayload.safeParse(payload);
  if (!parsed.success) throw new OpenRouterError("OPENROUTER_UNREACHABLE");
  const { usage, limit, limit_remaining, is_free_tier } = parsed.data.data;
  return {
    usageUsd: usage,
    limitUsd: limit ?? null,
    limitRemainingUsd: limit_remaining ?? null,
    isFreeTier: is_free_tier ?? false,
  };
}

/**
 * Checks a key and reads its credit usage. Throws OpenRouterError:
 * OPENROUTER_KEY_INVALID when OpenRouter rejects the key, otherwise
 * OPENROUTER_UNREACHABLE. Neither the key nor the body is ever logged.
 */
export async function getOpenRouterKeyInfo(
  apiKey: string,
  signal?: AbortSignal,
): Promise<OpenRouterKeyInfo> {
  const timeout = AbortSignal.timeout(KEY_TIMEOUT_MS);
  let response: Response;
  try {
    response = await withoutOutboundTelemetry(() =>
      fetch(`${OPENROUTER_BASE}/key`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": OPENROUTER_REFERER,
          "X-OpenRouter-Title": OPENROUTER_TITLE,
        },
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }),
    );
  } catch {
    throw new OpenRouterError("OPENROUTER_UNREACHABLE");
  }

  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new OpenRouterError(
      response.status === 401
        ? "OPENROUTER_KEY_INVALID"
        : "OPENROUTER_UNREACHABLE",
      { status: response.status },
    );
  }
  return parseKeyInfo(await readJsonResponse(response, MAX_KEY_RESPONSE_BYTES));
}
