import { HTTPException } from "hono/http-exception";
import { eventContext } from "../events";

// Restrict-only: the in-app assistant sends this header on every loopback call
// to keep it in one workspace. It can only narrow access, so any client may
// send it.
//
// Only these paths honour the pin, treating every other workspace as one the
// caller is not in (instance admins included):
// - validateWorkspaceAccess and everything built on it: workspaceAccess
//   middleware and the routes that scope themselves through it;
// - global search, whose workspace results keep only the pinned workspace;
// - ticket ID lookup, which scopes its own query.
// User-level routes do not: the workspace list and get routes, notifications,
// and the auth organization routes still see every workspace the user can.
// The assistant's tool catalog must therefore exclude any tool that reaches
// them.
export const ASSISTANT_WORKSPACE_HEADER = "x-kaneo-assistant-workspace";

const MAX_PIN_LENGTH = 128;

// A blank header is no pin. An over-long one is refused rather than ignored,
// so a malformed pin never falls back to full access.
export function parseAssistantWorkspacePin(
  header: string | undefined,
): string | undefined {
  const pin = header?.trim();
  if (!pin) return undefined;
  if (pin.length > MAX_PIN_LENGTH)
    throw new HTTPException(400, {
      message: "Invalid assistant workspace header",
    });
  return pin;
}

export function getPinnedWorkspaceId(): string | undefined {
  return eventContext.getStore()?.pinnedWorkspaceId;
}
