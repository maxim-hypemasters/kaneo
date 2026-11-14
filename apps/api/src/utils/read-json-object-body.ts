import type { Context } from "hono";

// Route middleware runs before the validators, so c.req.valid() is
// unavailable; read the raw JSON body and treat anything else as empty.
export async function readJsonObjectBody(
  c: Context,
): Promise<Record<string, unknown>> {
  const raw = (await c.req.json().catch(() => ({}))) || {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}
