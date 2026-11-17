import type { Context, Next } from "hono";
import { assistantError } from "../errors";

/**
 * Only JSON bodies are accepted. Browsers can send text/plain and form bodies
 * cross-site without a preflight, so refusing them blocks CSRF.
 */
export async function requireJsonContentType(c: Context, next: Next) {
  const mediaType = c.req
    .header("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw assistantError("UNSUPPORTED_CONTENT_TYPE");
  }
  return next();
}
