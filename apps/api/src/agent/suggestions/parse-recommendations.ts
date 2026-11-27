import {
  REASON_MAX_CHARS,
  type RecommendationKey,
  type Recommendations,
  recommendationSchemas,
} from "../assessment-schema";
import { isRecord } from "../is-record";

// A reason that runs long is shortened rather than losing the pick.
function clampReason(value: unknown) {
  if (!isRecord(value) || typeof value.reason !== "string") return value;
  return { ...value, reason: value.reason.trim().slice(0, REASON_MAX_CHARS) };
}

/** The recommendations that validate, each key checked on its own. */
export function parseRecommendations(raw: unknown): Recommendations {
  if (!isRecord(raw)) return {};
  const parsed: Record<string, unknown> = {};
  for (const key of Object.keys(recommendationSchemas) as RecommendationKey[]) {
    const result = recommendationSchemas[key].safeParse(clampReason(raw[key]));
    if (result.success) parsed[key] = result.data;
  }
  return parsed as Recommendations;
}
