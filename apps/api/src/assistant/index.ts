import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import { boundedRequestBody } from "../utils/bounded-request-body";
import { requireUserSession } from "../utils/require-user-session";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { deleteChat } from "./chats/delete-chat";
import { getChat } from "./chats/get-chat";
import { listChats } from "./chats/list-chats";
import { openRouterRequestError } from "./errors";
import { requireAssistantEnabled } from "./middleware/require-assistant-enabled";
import { requireJsonContentType } from "./middleware/require-json-content-type";
import { listToolModels } from "./openrouter/list-tool-models";
import { assistantDecisionsBody } from "./proposals/decisions-body";
import {
  assistantChatDeletedSchema,
  assistantChatDetailSchema,
  assistantChatListSchema,
  assistantDecisionsResultSchema,
  assistantKeyUsageSchema,
  assistantModelListSchema,
  assistantSettingsSchema,
  assistantStatusSchema,
} from "./response";
import {
  assistantContinueBody,
  assistantMessageBody,
  chatIdParam,
  listAssistantChatsQuery,
  updateAssistantSettingsBody,
  workspaceIdParam,
} from "./schema";
import { deleteAssistantSettings } from "./settings/delete-settings";
import { getAssistantKeyUsage } from "./settings/get-key-usage";
import { getAssistantSettings } from "./settings/get-settings";
import { saveAssistantSettings } from "./settings/save-settings";
import { toAssistantStatus } from "./settings/to-assistant-status";
import { loadAssistantConfig } from "./settings/load-assistant-config";
import { continueTurn } from "./turn/continue-turn";
import { decideApprovals } from "./turn/decide-approvals";
import { sendMessageTurn } from "./turn/send-message";
import { startChatTurn } from "./turn/start-chat-turn";

const MANAGE_SETTINGS = { workspace: ["manage_settings"] };
const SETTINGS_BODY_BYTES = 8 * 1024;
const CHAT_BODY_BYTES = 64 * 1024;
const DECISIONS_BODY_BYTES = 8 * 1024;

// Sessions only: an API key never configures or uses the assistant.
const member = [
  requireAssistantEnabled,
  requireUserSession,
  workspaceAccess.fromParam("workspaceId"),
  requireWorkspacePermission({ workspace: ["read"] }),
] as const;
const admin = [...member, requireWorkspacePermission(MANAGE_SETTINGS)] as const;

const tags = ["Assistant"];
const memberErrors = {
  403: errorResponse(
    "SESSION_REQUIRED for API keys, or no access to the workspace",
  ),
  404: errorResponse(
    "Workspace not found, or ASSISTANT_DISABLED when the instance turned the assistant off",
  ),
};
const chatNotFound =
  "ASSISTANT_CHAT_NOT_FOUND when the chat doesn't exist or isn't the caller's in this workspace; also workspace not found, or ASSISTANT_DISABLED";
const adminErrors = {
  ...memberErrors,
  403: errorResponse(
    "SESSION_REQUIRED for API keys, no access to the workspace, or missing workspace:manage_settings",
  ),
};

const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

// A turn streams Server-Sent Events after every check has passed; until
// then, refusals are ordinary JSON errors.
const turnBody = [
  ...member,
  requireJsonContentType,
  boundedRequestBody(CHAT_BODY_BYTES),
] as const;
const turnStream = {
  description:
    "Server-Sent Events, each one `data:` line of JSON (AssistantStreamEvent): `chat` (POST /chats only, first), `delta` (answer text), `message` (a saved message to insert or replace by id), then exactly one `done` or `error`. Error events carry a code and whether a retry may help, never upstream text. `: ping` comments keep the connection alive.",
  content: {
    "text/event-stream": {
      schema: z.string().openapi({
        description: "An SSE stream of AssistantStreamEvent records",
      }),
    },
  },
};
const turnRefusals = {
  400: errorResponse("Invalid body, or UNSUPPORTED_CONTENT_TYPE"),
  413: errorResponse("Request body is too large"),
  429: errorResponse(
    "ASSISTANT_TOO_MANY_TURNS while too many answers stream at once (retry after Retry-After), or ASSISTANT_DAILY_LIMIT",
  ),
};
const notReady =
  "ASSISTANT_NOT_CONFIGURED, or ASSISTANT_KEY_UNREADABLE when an admin must enter the key again";

const assistant = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(
    createRoute({
      method: "get",
      operationId: "getAssistantStatus",
      path: "/{workspaceId}/status",
      tags,
      summary: "Get assistant availability",
      description:
        "Whether members can chat with the workspace assistant, the model it uses, and whether the caller can configure it. Never includes the key or its hint.",
      middleware: [...member],
      request: { params: workspaceIdParam },
      responses: {
        200: jsonResponse("Assistant availability", assistantStatusSchema),
        ...memberErrors,
      },
    }),
    async (c) =>
      c.json(
        toAssistantStatus(
          await loadAssistantConfig(c.get("workspaceId")),
          await hasWorkspacePermission(c, MANAGE_SETTINGS),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getAssistantSettings",
      path: "/{workspaceId}/settings",
      tags,
      summary: "Get assistant settings",
      description:
        "The workspace's OpenRouter configuration: the key's last four characters and state, the model and the data collection choice. The key itself is never returned.",
      middleware: [...admin],
      request: { params: workspaceIdParam },
      responses: {
        200: jsonResponse("Assistant settings", assistantSettingsSchema),
        ...adminErrors,
      },
    }),
    async (c) => c.json(await getAssistantSettings(c.get("workspaceId")), 200),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "updateAssistantSettings",
      path: "/{workspaceId}/settings",
      tags,
      summary: "Save assistant settings",
      description:
        "Save the workspace's OpenRouter key and model. A new key is checked with OpenRouter, encrypted at rest and never returned; leave it out to keep the saved key. The model must support tool calls on OpenRouter; when the model list can't be loaded, it is saved unchecked with modelUnverified. Every member then chats on this key. Saving clears the last provider error.",
      middleware: [
        ...admin,
        requireJsonContentType,
        boundedRequestBody(SETTINGS_BODY_BYTES),
      ],
      request: {
        params: workspaceIdParam,
        body: json(updateAssistantSettingsBody),
      },
      responses: {
        200: jsonResponse("The saved settings", assistantSettingsSchema),
        400: errorResponse(
          "Invalid body; UNSUPPORTED_CONTENT_TYPE; OPENROUTER_KEY_REQUIRED when no readable key is saved and none is given; OPENROUTER_KEY_INVALID when OpenRouter rejects the key; ASSISTANT_MODEL_UNSUPPORTED",
        ),
        ...adminErrors,
        413: errorResponse("Request body is too large"),
        502: errorResponse(
          "OPENROUTER_UNREACHABLE: the key could not be checked",
        ),
      },
    }),
    async (c) =>
      c.json(
        await saveAssistantSettings(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "deleteAssistantSettings",
      path: "/{workspaceId}/settings",
      tags,
      summary: "Remove assistant settings",
      description:
        "Remove the workspace's OpenRouter key and model, which turns the assistant off for every member. Chats are kept.",
      middleware: [...admin],
      request: { params: workspaceIdParam },
      responses: {
        200: jsonResponse(
          "The settings after removal (configured false)",
          assistantSettingsSchema,
        ),
        ...adminErrors,
      },
    }),
    async (c) =>
      c.json(await deleteAssistantSettings(c.get("workspaceId")), 200),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getAssistantKeyUsage",
      path: "/{workspaceId}/settings/usage",
      tags,
      summary: "Get assistant key usage",
      description:
        "The saved OpenRouter key's credit usage and limit, as OpenRouter reports them. Cached for up to 60 seconds.",
      middleware: [...admin],
      request: { params: workspaceIdParam },
      responses: {
        200: jsonResponse("Credit usage of the key", assistantKeyUsageSchema),
        400: errorResponse(
          "OPENROUTER_KEY_INVALID: OpenRouter rejected the saved key",
        ),
        ...adminErrors,
        409: errorResponse(
          "ASSISTANT_NOT_CONFIGURED, or ASSISTANT_KEY_UNREADABLE when the saved key must be entered again",
        ),
        502: errorResponse("OPENROUTER_UNREACHABLE"),
      },
    }),
    async (c) => c.json(await getAssistantKeyUsage(c.get("workspaceId")), 200),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listAssistantModels",
      path: "/{workspaceId}/models",
      tags,
      summary: "List assistant models",
      description:
        "OpenRouter models that support tool calls through chat completions, with prices per million tokens. Recommended models come first. Cached for up to an hour.",
      middleware: [...admin],
      request: { params: workspaceIdParam },
      responses: {
        200: jsonResponse("Tool-capable models", assistantModelListSchema),
        ...adminErrors,
        502: errorResponse("OPENROUTER_UNREACHABLE"),
      },
    }),
    async (c) => {
      const models = await listToolModels().catch((error: unknown) => {
        throw openRouterRequestError(error);
      });
      return c.json({ models }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listAssistantChats",
      path: "/{workspaceId}/chats",
      tags,
      summary: "List assistant chats",
      description:
        "The caller's own chats in the workspace, latest activity first, with whether each is answering and how many changes wait for approval. Chats are private: nobody else, admins included, can list them. Page with `before` set to the previous page's `nextCursor`.",
      middleware: [...member],
      request: { params: workspaceIdParam, query: listAssistantChatsQuery },
      responses: {
        200: jsonResponse("A page of chats", assistantChatListSchema),
        400: errorResponse("Invalid limit or cursor"),
        ...memberErrors,
      },
    }),
    async (c) => {
      const { limit, before } = c.req.valid("query");
      return c.json(
        await listChats({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          limit,
          before,
        }),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getAssistantChat",
      path: "/{workspaceId}/chats/{chatId}",
      tags,
      summary: "Get an assistant chat",
      description:
        "One of the caller's own chats with its latest 300 messages, oldest first. Tool steps show their name, approval state, preview and a short error, never what a read returned. `busy` says whether a turn is answering in it right now, and `resumable` whether Continue can pick the chat up.",
      middleware: [...member],
      request: { params: chatIdParam },
      responses: {
        200: jsonResponse(
          "The chat and its messages",
          assistantChatDetailSchema,
        ),
        ...memberErrors,
        404: errorResponse(chatNotFound),
      },
    }),
    async (c) =>
      c.json(
        await getChat({
          chatId: c.req.valid("param").chatId,
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
        }),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "deleteAssistantChat",
      path: "/{workspaceId}/chats/{chatId}",
      tags,
      summary: "Delete an assistant chat",
      description:
        "Delete one of the caller's own chats and its messages. Refused while the chat is answering. The daily usage count is kept.",
      middleware: [...member],
      request: { params: chatIdParam },
      responses: {
        200: jsonResponse("The chat was deleted", assistantChatDeletedSchema),
        ...memberErrors,
        404: errorResponse(chatNotFound),
        409: errorResponse(
          "ASSISTANT_CHAT_BUSY while a turn is answering in the chat",
        ),
      },
    }),
    async (c) =>
      c.json(
        await deleteChat({
          chatId: c.req.valid("param").chatId,
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
        }),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "startAssistantChat",
      path: "/{workspaceId}/chats",
      tags,
      summary: "Start an assistant chat",
      description:
        "Create a chat with its first message and stream the assistant's answer. The assistant reads the workspace as the caller, with the caller's permissions. Changes it proposes wait as pending tool messages until the caller approves them with POST /chats/{chatId}/decisions; the stream then ends with `done` and their count. Every refusal is answered as JSON before the chat is created, so a refused request leaves no chat. The stream's first event is `chat` with the new chat's id. Stopping the request stops the answer; what streamed so far is kept.",
      middleware: [...turnBody],
      request: { params: workspaceIdParam, body: json(assistantMessageBody) },
      responses: {
        200: turnStream,
        ...turnRefusals,
        ...memberErrors,
        409: errorResponse(notReady),
      },
    }),
    async (c) => startChatTurn(c, c.req.valid("json")),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "sendAssistantMessage",
      path: "/{workspaceId}/chats/{chatId}/messages",
      tags,
      summary: "Send a message in an assistant chat",
      description:
        "Add the next message to one of the caller's chats and stream the answer. Proposed changes still waiting for approval are skipped. Refused while the chat is answering.",
      middleware: [...turnBody],
      request: { params: chatIdParam, body: json(assistantMessageBody) },
      responses: {
        200: turnStream,
        ...turnRefusals,
        ...memberErrors,
        404: errorResponse(chatNotFound),
        409: errorResponse(
          `${notReady}; ASSISTANT_CHAT_BUSY while the chat is answering`,
        ),
      },
    }),
    async (c) =>
      sendMessageTurn(c, c.req.valid("param").chatId, c.req.valid("json")),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "continueAssistantTurn",
      path: "/{workspaceId}/chats/{chatId}/continue",
      tags,
      summary: "Continue an assistant answer",
      description:
        "Resume one of the caller's chats where its answer stopped: after Stop, a failed step, or decided changes. Adds no message and streams the rest of the answer.",
      middleware: [...turnBody],
      request: { params: chatIdParam, body: json(assistantContinueBody) },
      responses: {
        200: turnStream,
        ...turnRefusals,
        ...memberErrors,
        404: errorResponse(chatNotFound),
        409: errorResponse(
          `${notReady}; ASSISTANT_CHAT_BUSY while the chat is answering; ASSISTANT_PENDING_APPROVALS while proposed changes wait; ASSISTANT_NOTHING_TO_CONTINUE when the chat already ends in an answer`,
        ),
      },
    }),
    async (c) =>
      continueTurn(c, c.req.valid("param").chatId, c.req.valid("json")),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "decideAssistantActions",
      path: "/{workspaceId}/chats/{chatId}/decisions",
      tags,
      summary: "Approve or reject proposed changes",
      description:
        "Approve or reject changes the assistant proposed in one of the caller's chats. Each decided change leaves pending exactly once, so a repeated or concurrent request runs nothing twice. Approved changes run in the order they were proposed, as the caller with the caller's current permissions; one that fails writes nothing and reports the API's error. Updates of text without a conflict check fail without writing when the text changed since the proposal, and a task archived since stays archived. No write starts after about 10 seconds: those changes stay pending. Messages of other chats are ignored. Call Continue afterwards when `resumable` is true.",
      middleware: [
        ...member,
        requireJsonContentType,
        boundedRequestBody(DECISIONS_BODY_BYTES),
      ],
      request: { params: chatIdParam, body: json(assistantDecisionsBody) },
      responses: {
        200: jsonResponse(
          "The decided changes and what waits next",
          assistantDecisionsResultSchema,
        ),
        400: errorResponse(
          "Invalid body, a message decided twice, or UNSUPPORTED_CONTENT_TYPE",
        ),
        ...memberErrors,
        404: errorResponse(chatNotFound),
        409: errorResponse(
          "ASSISTANT_CHAT_BUSY while the chat is answering or deciding; ASSISTANT_NOTHING_PENDING when none of the messages waits for approval",
        ),
        413: errorResponse("Request body is too large"),
      },
    }),
    async (c) =>
      c.json(
        await decideApprovals(
          c,
          c.req.valid("param").chatId,
          c.req.valid("json"),
        ),
        200,
      ),
  );

export default assistant;
