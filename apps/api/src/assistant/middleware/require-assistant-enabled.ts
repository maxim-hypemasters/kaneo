import type { Context, Next } from "hono";
import { isAssistantEnabled } from "../assistant-enabled";
import { assistantError } from "../errors";

/** DISABLE_ASSISTANT=true answers every assistant route with a 404. */
export async function requireAssistantEnabled(_c: Context, next: Next) {
  if (!isAssistantEnabled()) throw assistantError("ASSISTANT_DISABLED");
  return next();
}
