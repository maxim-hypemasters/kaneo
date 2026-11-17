import type { ToolClient } from "@kaneo/mcp/tools";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { workspaceTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import type { BaseVariables } from "../../openapi";
import { ASSISTANT_WORKSPACE_HEADER } from "../../utils/assistant-workspace-pin";
import { InternalApiClient } from "../../utils/internal-api-client";
import { internalApiUrl } from "../../utils/internal-api-url";
import { workspacePermissionChecker } from "../../utils/require-workspace-permission";
import { releaseChatLease, renewChatLease } from "../chats/chat-lease";
import { READ_TIMEOUT_MS } from "../constants";
import { assistantError } from "../errors";
import { createProposeWrite } from "../proposals/propose-write";
import {
  type ReadyAssistantConfig,
  requireReadyConfig,
} from "../settings/load-assistant-config";
import {
  type AssistantTools,
  createAssistantTools,
} from "../tools/assistant-tools";
import { loopbackLimiter } from "../tools/loopback-limiter";
import { runTurn } from "./run-turn";
import { type EmitEvent, streamTurn } from "./stream-turn";
import { type TurnSlot, tryAcquireTurnSlot } from "./turn-slots";
import { checkDailyAllowance } from "./usage";

export type AssistantContext = Context<{
  Variables: BaseVariables & { workspaceId: string };
}>;

/** Everything a turn needs that doesn't depend on the chat. */
export type TurnSetup = {
  workspace: { id: string; name: string; slug: string };
  user: { id: string; name: string };
  config: ReadyAssistantConfig;
  tools: AssistantTools;
  /** The tools' read-only client, which write proposals read through. */
  readClient: ToolClient;
};

const TURN_RETRY_AFTER_SECONDS = 5;

/**
 * The checks every turn passes before anything is written, in order: a
 * usable key (409), then the user's daily allowance (429). Then the tools,
 * which act as the caller over loopback HTTP, read-only and pinned to this
 * workspace.
 */
export async function prepareTurn(c: AssistantContext): Promise<TurnSetup> {
  const workspaceId = c.get("workspaceId");
  const userId = c.get("userId");
  const config = await requireReadyConfig(workspaceId);
  await checkDailyAllowance(workspaceId, userId);

  const token = c.get("session")?.token;
  const user = c.get("user");
  if (!token || !user) {
    throw new ApiError(403, {
      message: "A user session is required",
      code: "SESSION_REQUIRED",
    });
  }
  const [workspace] = await db
    .select({
      id: workspaceTable.id,
      name: workspaceTable.name,
      slug: workspaceTable.slug,
    })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);
  if (!workspace) {
    throw new HTTPException(404, { message: "Workspace not found" });
  }

  const readClient = new InternalApiClient({
    baseUrl: internalApiUrl,
    token,
    extraHeaders: { [ASSISTANT_WORKSPACE_HEADER]: workspaceId },
    readOnly: true,
    timeoutMs: READ_TIMEOUT_MS,
    limiter: loopbackLimiter,
  });
  const tools = createAssistantTools({
    workspaceId,
    can: await workspacePermissionChecker(c),
    client: readClient,
    mode: "read",
  });
  return {
    workspace,
    user: { id: userId, name: user.name },
    config,
    tools,
    readClient,
  };
}

/** One of this process's turn slots, or 429 ASSISTANT_TOO_MANY_TURNS. */
export function takeTurnSlot(userId: string): TurnSlot {
  const slot = tryAcquireTurnSlot(userId);
  if (slot) return slot;
  const error = assistantError("ASSISTANT_TOO_MANY_TURNS");
  throw new HTTPException(error.status, {
    res: Response.json(
      { message: error.message, code: error.code },
      {
        status: error.status,
        headers: { "Retry-After": String(TURN_RETRY_AFTER_SECONDS) },
      },
    ),
  });
}

/**
 * Releases a lease taken by a request that then failed before streaming. A
 * failure here only delays the chat until the lease expires.
 */
export async function releaseLeaseAfterFailure(
  chatId: string,
  leaseToken: string,
) {
  await releaseChatLease(chatId, leaseToken).catch(() => {});
}

/**
 * Streams a turn in a chat whose lease and slot the caller holds: `intro`
 * events first, then the tool-calling loop. The heartbeat renews the lease;
 * the lease and slot are released exactly once when the stream ends.
 */
export function streamChatTurn(
  c: AssistantContext,
  input: {
    setup: TurnSetup;
    chatId: string;
    leaseToken: string;
    slot: TurnSlot;
    timeZone: string | undefined;
    intro?: (emit: EmitEvent) => Promise<void>;
  },
): Response {
  const { setup, chatId, leaseToken, slot } = input;
  return streamTurn(
    c,
    async (emit, signal) => {
      await input.intro?.(emit);
      await runTurn({
        ...setup,
        chatId,
        emit,
        signal,
        timeZone: input.timeZone,
        proposeWrite: createProposeWrite({
          tools: setup.tools,
          readClient: setup.readClient,
          workspaceId: setup.workspace.id,
        }),
      });
    },
    async () => {
      try {
        await releaseChatLease(chatId, leaseToken);
      } finally {
        slot.release();
      }
    },
    { onHeartbeat: () => renewChatLease(chatId, leaseToken) },
  );
}
