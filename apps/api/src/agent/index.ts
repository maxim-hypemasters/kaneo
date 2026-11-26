import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireUserSession } from "../utils/require-user-session";
import { requireWorkItemPermission } from "../utils/require-work-item-permission";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { applySuggestion } from "./controllers/apply-suggestion";
import { cancelShip } from "./controllers/cancel-ship";
import { dismissSuggestion } from "./controllers/dismiss-suggestion";
import { getProjectAgentSettings } from "./controllers/get-project-agent-settings";
import { getTaskAgent } from "./controllers/get-task-agent";
import {
  loadWorkspaceRunner,
  toRunnerStatus,
} from "./controllers/load-workspace-runner";
import { requestAssessment } from "./controllers/request-assessment";
import { revokeRunner } from "./controllers/revoke-runner";
import { rotateRunnerToken } from "./controllers/rotate-runner-token";
import { saveProjectAgentSettings } from "./controllers/save-project-agent-settings";
import { shipTask } from "./controllers/ship-task";
import { submitAnswers } from "./controllers/submit-answers";
import { requireAgentEnabled } from "./middleware/require-agent-enabled";
import {
  agentRunnerStatusSchema,
  agentRunnerTokenSchema,
  okSchema,
  projectAgentSettingsSchema,
  taskAgentSchema,
} from "./response";
import {
  projectAgentSettingsBody,
  projectIdParam,
  submitAnswersBody,
  suggestionParam,
  taskIdParam,
  workspaceIdParam,
} from "./schema";
import "./subscriptions";

const tags = ["AI agent"];
const MANAGE_SETTINGS = { workspace: ["manage_settings"] };

const readTask = [
  requireAgentEnabled,
  workspaceAccess.fromTaskId("taskId"),
  requireWorkItemPermission("read"),
] as const;
const editTask = [
  requireAgentEnabled,
  workspaceAccess.fromTaskId("taskId"),
  requireWorkItemPermission("update"),
] as const;
const manageProject = [
  requireAgentEnabled,
  workspaceAccess.fromProjectId("projectId"),
  requireWorkspacePermission(MANAGE_SETTINGS),
] as const;
// Runner tokens are credentials, so only a signed-in admin handles them.
const manageRunner = [
  requireAgentEnabled,
  requireUserSession,
  workspaceAccess.fromParam("workspaceId"),
  requireWorkspacePermission(MANAGE_SETTINGS),
] as const;

const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

const taskErrors = {
  400: errorResponse("AI_AGENT_NOT_WORK_ITEM for a feature"),
  403: errorResponse("No access to the task, or missing permission"),
  404: errorResponse("Task not found, or AI_AGENT_DISABLED on this instance"),
};
const editErrors = {
  ...taskErrors,
  409: errorResponse("AI_AGENT_NOT_ENABLED for the task's project"),
};
const ok = { 200: jsonResponse("Done", okSchema) };

const agent = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(
    createRoute({
      method: "get",
      operationId: "getTaskAgent",
      path: "/task/{taskId}",
      tags,
      summary: "Get a task's AI readiness",
      description:
        "The latest readiness assessment, open questions and suggestions, answered decisions, and the state of Ship for a task or bug.",
      middleware: [...readTask],
      request: { params: taskIdParam },
      responses: {
        200: jsonResponse("AI agent state of the task", taskAgentSchema),
        ...taskErrors,
      },
    }),
    async (c) => c.json(await getTaskAgent(c.req.valid("param").taskId), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "requestTaskAssessment",
      path: "/task/{taskId}/assess",
      tags,
      summary: "Assess AI readiness now",
      description:
        "Queues a readiness assessment. An assessment already waiting is moved up instead of duplicated.",
      middleware: [...editTask],
      request: { params: taskIdParam },
      responses: { ...ok, ...editErrors },
    }),
    async (c) => {
      await requestAssessment(c.req.valid("param").taskId, c.get("userId"));
      return c.json({ ok: true as const }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "answerTaskAgentQuestions",
      path: "/task/{taskId}/answers",
      tags,
      summary: "Answer the agent's questions",
      description:
        "Saves the answers as decisions, removes those questions, and assesses the task again.",
      middleware: [...editTask],
      request: { params: taskIdParam, body: json(submitAnswersBody) },
      responses: {
        ...ok,
        ...editErrors,
        404: errorResponse(
          "Task not found, AI_AGENT_QUESTION_NOT_FOUND, or AI_AGENT_DISABLED",
        ),
      },
    }),
    async (c) => {
      await submitAnswers(
        c.req.valid("param").taskId,
        c.get("userId"),
        c.req.valid("json").answers,
      );
      return c.json({ ok: true as const }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "applyTaskAgentSuggestion",
      path: "/task/{taskId}/suggestions/{suggestionId}/apply",
      tags,
      summary: "Add a suggestion to the description",
      description:
        "Appends the suggestion's Markdown to the task description as an ordinary edit by the caller.",
      middleware: [...editTask],
      request: { params: suggestionParam },
      responses: {
        ...ok,
        ...editErrors,
        404: errorResponse(
          "Task not found, AI_AGENT_SUGGESTION_NOT_FOUND, or AI_AGENT_DISABLED",
        ),
        409: errorResponse(
          "AI_AGENT_NOT_ENABLED, DESCRIPTION_CONFLICT when the description changed since it was read, or the task moved to another project or workspace meanwhile",
        ),
      },
    }),
    async (c) => {
      const { taskId, suggestionId } = c.req.valid("param");
      await applySuggestion(taskId, suggestionId, c.get("userId"));
      return c.json({ ok: true as const }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "dismissTaskAgentSuggestion",
      path: "/task/{taskId}/suggestions/{suggestionId}",
      tags,
      summary: "Dismiss a suggestion",
      middleware: [...editTask],
      request: { params: suggestionParam },
      responses: {
        ...ok,
        ...editErrors,
        404: errorResponse(
          "Task not found, AI_AGENT_SUGGESTION_NOT_FOUND, or AI_AGENT_DISABLED",
        ),
      },
    }),
    async (c) => {
      const { taskId, suggestionId } = c.req.valid("param");
      await dismissSuggestion(taskId, suggestionId);
      return c.json({ ok: true as const }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "shipTask",
      path: "/task/{taskId}/ship",
      tags,
      summary: "Ship the task to the AI agent",
      description:
        "Queues the agent to implement the task in the project's repository and open a pull request. Refused with AI_AGENT_NOT_SHIPPABLE, listing the blockers in issues, unless the current assessment is ready.",
      middleware: [...editTask],
      request: { params: taskIdParam },
      responses: {
        ...ok,
        ...editErrors,
        409: errorResponse("AI_AGENT_NOT_ENABLED or AI_AGENT_NOT_SHIPPABLE"),
      },
    }),
    async (c) => {
      await shipTask(c.req.valid("param").taskId, c.get("userId"));
      return c.json({ ok: true as const }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "cancelTaskShip",
      path: "/task/{taskId}/cancel",
      tags,
      summary: "Stop the agent working on the task",
      description:
        "Cancels a queued Ship, or a running one whose runner stopped reporting, at once. A live run is asked to stop and ends at the runner's next heartbeat.",
      middleware: [...editTask],
      request: { params: taskIdParam },
      responses: {
        ...ok,
        ...taskErrors,
        409: errorResponse("AI_AGENT_NO_ACTIVE_RUN"),
      },
    }),
    async (c) => {
      await cancelShip(c.req.valid("param").taskId);
      return c.json({ ok: true as const }, 200);
    },
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getProjectAgentSettings",
      path: "/project/{projectId}/settings",
      tags,
      summary: "Get a project's AI agent settings",
      middleware: [...manageProject],
      request: { params: projectIdParam },
      responses: {
        200: jsonResponse("Settings", projectAgentSettingsSchema),
        403: errorResponse("Missing workspace:manage_settings"),
        404: errorResponse("Project not found, or AI_AGENT_DISABLED"),
      },
    }),
    async (c) =>
      c.json(
        await getProjectAgentSettings(c.req.valid("param").projectId),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "updateProjectAgentSettings",
      path: "/project/{projectId}/settings",
      tags,
      summary: "Update a project's AI agent settings",
      description:
        "Turning the agent off cancels its queued work in the project and asks running work to stop.",
      middleware: [...manageProject],
      request: {
        params: projectIdParam,
        body: json(projectAgentSettingsBody),
      },
      responses: {
        200: jsonResponse("Saved settings", projectAgentSettingsSchema),
        400: errorResponse("Invalid settings"),
        403: errorResponse("Missing workspace:manage_settings"),
        404: errorResponse("Project not found, or AI_AGENT_DISABLED"),
      },
    }),
    async (c) =>
      c.json(
        await saveProjectAgentSettings(
          c.req.valid("param").projectId,
          c.get("userId"),
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getAgentRunner",
      path: "/workspace/{workspaceId}/runner",
      tags,
      summary: "Get the workspace's agent runner",
      middleware: [...manageRunner],
      request: { params: workspaceIdParam },
      responses: {
        200: jsonResponse("Runner status", agentRunnerStatusSchema),
        403: errorResponse(
          "SESSION_REQUIRED, or missing workspace:manage_settings",
        ),
        404: errorResponse("Workspace not found, or AI_AGENT_DISABLED"),
      },
    }),
    async (c) =>
      c.json(
        toRunnerStatus(
          await loadWorkspaceRunner(c.req.valid("param").workspaceId),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "rotateAgentRunnerToken",
      path: "/workspace/{workspaceId}/runner/token",
      tags,
      summary: "Create or replace the runner token",
      description:
        "Returns a new token once. The previous token stops working immediately.",
      middleware: [...manageRunner],
      request: { params: workspaceIdParam },
      responses: {
        200: jsonResponse("New token", agentRunnerTokenSchema),
        403: errorResponse(
          "SESSION_REQUIRED, or missing workspace:manage_settings",
        ),
        404: errorResponse("Workspace not found, or AI_AGENT_DISABLED"),
      },
    }),
    async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(
        await rotateRunnerToken(
          c.req.valid("param").workspaceId,
          c.get("userId"),
        ),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "revokeAgentRunner",
      path: "/workspace/{workspaceId}/runner",
      tags,
      summary: "Revoke the runner token",
      middleware: [...manageRunner],
      request: { params: workspaceIdParam },
      responses: {
        ...ok,
        403: errorResponse(
          "SESSION_REQUIRED, or missing workspace:manage_settings",
        ),
        404: errorResponse("Workspace not found, or AI_AGENT_DISABLED"),
      },
    }),
    async (c) => {
      await revokeRunner(c.req.valid("param").workspaceId);
      return c.json({ ok: true as const }, 200);
    },
  );

export default agent;
