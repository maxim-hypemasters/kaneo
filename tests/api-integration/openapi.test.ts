import { beforeAll, describe, expect, it } from "vite-plus/test";
import { createApp } from "../../apps/api/src/index";

type Operation = {
  operationId?: string;
  summary?: string;
  responses: Record<string, unknown>;
  security?: unknown[];
};
type Spec = {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
  security?: Array<Record<string, unknown>>;
  components: {
    responses: Record<
      string,
      { headers?: Record<string, unknown>; content?: Record<string, unknown> }
    >;
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, { type: string; scheme?: string }>;
  };
};

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function operations(spec: Spec): Array<[string, string, Operation]> {
  const out: Array<[string, string, Operation]> = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (HTTP_METHODS.includes(method)) out.push([method, path, operation]);
    }
  }
  return out;
}

let spec: Spec;

beforeAll(async () => {
  const { app } = createApp();
  const response = await app.request("/api/openapi");
  expect(response.status).toBe(200);
  spec = (await response.json()) as Spec;
});

describe("Kaneo API OpenAPI spec", () => {
  it("is a valid OpenAPI 3.1 document", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Kaneo API");
  });

  it("requires bearer auth globally", () => {
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(spec.security).toContainEqual({ bearerAuth: [] });
  });

  it("documents the routes the clients depend on", () => {
    const keys = new Set(
      operations(spec).map(
        ([method, path]) => `${method.toUpperCase()} ${path}`,
      ),
    );
    for (const op of [
      "GET /config",
      "GET /mattermost-integration/project/{projectId}",
      "POST /mattermost-integration/project/{projectId}",
      "PATCH /mattermost-integration/project/{projectId}",
      "DELETE /mattermost-integration/project/{projectId}",
      "GET /label/{id}",
      "POST /label",
      "GET /project",
      "GET /task/tasks/{projectId}",
      "PATCH /task/bulk",
      "GET /release/project/{projectId}",
      "POST /release/project/{projectId}",
      "GET /release/{id}",
      "PUT /release/{id}",
      "DELETE /release/{id}",
      "POST /release/{id}/move-unfinished",
      "PUT /task/release/{id}",
      "GET /search",
      "GET /notification",
      "GET /workspace",
      "GET /workspace/{workspaceId}",
      "GET /workspace/{workspaceId}/capabilities",
      "GET /time-off/workspace/{workspaceId}",
      "POST /time-off/workspace/{workspaceId}",
      "GET /time-off/workspace/{workspaceId}/requests",
      "GET /time-off/workspace/{workspaceId}/pending",
      "GET /time-off/workspace/{workspaceId}/balance",
      "GET /time-off/workspace/{workspaceId}/balances",
      "GET /time-off/workspace/{workspaceId}/allowance",
      "PUT /time-off/workspace/{workspaceId}/allowance/{type}",
      "PUT /time-off/workspace/{workspaceId}/allowance/{type}/{userId}",
      "DELETE /time-off/workspace/{workspaceId}/allowance/{type}/{userId}",
      "GET /time-off/workspace/{workspaceId}/holiday-countries",
      "GET /time-off/workspace/{workspaceId}/holiday-countries/{country}/regions",
      "GET /time-off/workspace/{workspaceId}/holidays",
      "PUT /time-off/workspace/{workspaceId}/holiday-calendar",
      "DELETE /time-off/workspace/{workspaceId}/holiday-calendar",
      "GET /time-off/workspace/{workspaceId}/holiday-calendar-requests",
      "POST /time-off/workspace/{workspaceId}/holiday-calendar-requests/{requestId}/approve",
      "POST /time-off/workspace/{workspaceId}/holiday-calendar-requests/{requestId}/decline",
      "POST /time-off/workspace/{workspaceId}/holiday-calendar-requests/{requestId}/cancel",
      "GET /time-off/workspace/{workspaceId}/settings",
      "PUT /time-off/workspace/{workspaceId}/settings",
      "GET /time-off/{id}",
      "PATCH /time-off/{id}",
      "POST /time-off/{id}/cancel",
      "POST /time-off/{id}/approve",
      "POST /time-off/{id}/decline",
      "GET /project-document/{id}/comments",
      "POST /project-document/{id}/comments",
      "POST /project-document/{id}/comments/{commentId}/replies",
      "PUT /project-document/{id}/comments/{commentId}",
      "DELETE /project-document/{id}/comments/{commentId}",
      "PUT /project-document/{id}/comments/{commentId}/resolution",
      "GET /feature/{id}/documents/{documentId}/comments",
      "POST /feature/{id}/documents/{documentId}/comments",
      "POST /feature/{id}/documents/{documentId}/comments/{commentId}/replies",
      "PUT /feature/{id}/documents/{documentId}/comments/{commentId}",
      "DELETE /feature/{id}/documents/{documentId}/comments/{commentId}",
      "PUT /feature/{id}/documents/{documentId}/comments/{commentId}/resolution",
      "POST /auth/organization/create",
    ]) {
      expect(keys.has(op), `missing operation ${op}`).toBe(true);
    }
  });

  it("gives every operation a unique operationId and a summary", () => {
    const ids: string[] = [];
    for (const [method, path, operation] of operations(spec)) {
      expect(
        operation.operationId,
        `${method} ${path} has no operationId`,
      ).toBeTruthy();
      expect(
        operation.summary,
        `${method} ${path} has no summary`,
      ).toBeTruthy();
      ids.push(operation.operationId as string);
    }
    expect(new Set(ids).size, "operationIds must be unique").toBe(ids.length);
  });

  it("names its entity schemas as reusable components", () => {
    expect(Object.keys(spec.components.schemas)).toEqual(
      expect.arrayContaining([
        "Task",
        "Project",
        "Label",
        "Column",
        "Release",
        "ReleaseWithProgress",
        "DeletedRelease",
        "MovedReleaseItems",
        "TaskReleaseResult",
        "Comment",
        "Activity",
        "TimeEntry",
        "Notification",
        "Config",
        "SearchResult",
        "Workspace",
        "WorkspaceMember",
        "MattermostIntegration",
        "WorkspaceCapabilities",
        "TimeOffCalendar",
        "TimeOffEntry",
        "TimeOffRequest",
        "TimeOffRequestList",
        "TimeOffRequestResult",
        "PendingTimeOffList",
        "TimeOffBalance",
        "TimeOffTypeBalance",
        "TimeOffBalances",
        "TimeOffAllowanceDefault",
        "TimeOffAllowanceDefaults",
        "TimeOffHoliday",
        "HolidayCountryList",
        "HolidayRegionList",
        "HolidayCalendar",
        "MemberHolidays",
        "HolidayCalendarResult",
        "HolidayCalendarRequest",
        "PendingHolidayCalendarRequestList",
        "TimeOffSettings",
        "DocumentComment",
        "DocumentCommentThread",
      ]),
    );
  });

  it("names the document comment operations for generated clients", () => {
    const ids = new Set(
      operations(spec).map(([, , operation]) => operation.operationId),
    );
    for (const subject of ["ProjectDocument", "FeatureDocument"])
      for (const id of [
        `list${subject}Comments`,
        `create${subject}Comment`,
        `replyTo${subject}Comment`,
        `update${subject}Comment`,
        `delete${subject}Comment`,
        `set${subject}CommentResolution`,
      ])
        expect(ids.has(id), `missing operationId ${id}`).toBe(true);
  });

  it("describes re-anchoring on both document saves", () => {
    for (const path of [
      "/project-document/{id}",
      "/feature/{id}/documents/{documentId}",
    ]) {
      const body = (
        spec.paths[path]!.put as unknown as {
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  properties: Record<
                    string,
                    { maxItems?: number; description?: string }
                  >;
                };
              };
            };
          };
        }
      ).requestBody.content["application/json"].schema;
      expect(body.properties.commentAnchors, path).toMatchObject({
        maxItems: 200,
        description: expect.stringContaining("comment threads"),
      });
    }
  });

  it("documents Kaneo errors as ApiError JSON", () => {
    expect(spec.components.schemas.ApiError).toMatchObject({
      type: "object",
      required: ["message", "code"],
    });
    const plainText: string[] = [];
    for (const [method, path, operation] of operations(spec)) {
      if (path.startsWith("/mcp/")) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!/^[45]/.test(status)) continue;
        const ref = (response as { $ref?: string }).$ref;
        const content = (
          ref
            ? spec.components.responses[ref.split("/").pop() ?? ""]
            : (response as { content?: Record<string, unknown> })
        )?.content;
        if (!content?.["application/json"])
          plainText.push(`${method.toUpperCase()} ${path} ${status}`);
      }
    }
    expect(plainText).toEqual([]);
    expect(spec.paths["/task/{id}"]?.get?.responses["401"]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiError" },
        },
      },
    });
  });

  it("documents the assignee-away conflict on every task date and assignee write", () => {
    for (const [method, path] of [
      ["put", "/task/{id}"],
      ["put", "/task/assignee/{id}"],
      ["put", "/task/due-date/{id}"],
      ["put", "/task/schedule/{id}"],
      ["patch", "/task/bulk"],
    ] as const) {
      const conflict = spec.paths[path]?.[method]?.responses["409"] as
        | { description?: string }
        | undefined;
      expect(
        conflict?.description,
        `${method.toUpperCase()} ${path}`,
      ).toContain("TASK_ASSIGNEE_AWAY");
    }
  });

  it("documents a 401 on every operation that requires auth", () => {
    const missing: string[] = [];
    for (const [method, path, operation] of operations(spec)) {
      const isPublic =
        Array.isArray(operation.security) && operation.security.length === 0;
      if (isPublic) continue;
      if (!operation.responses["401"])
        missing.push(`${method.toUpperCase()} ${path}`);
    }
    expect(missing).toEqual([]);
  });

  it("documents the API key rate limit on every operation that requires auth", () => {
    expect(
      Object.keys(
        spec.components.responses.ApiKeyRateLimited?.headers ?? {},
      ).sort(),
    ).toEqual([
      "Retry-After",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ]);
    expect(spec.components.responses.ApiKeyRateLimited?.content).toEqual({
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiError" },
      },
    });
    const missing: string[] = [];
    for (const [method, path, operation] of operations(spec)) {
      const isPublic =
        Array.isArray(operation.security) && operation.security.length === 0;
      if (isPublic) continue;
      // Agent runners send a runner token, never an API key.
      const runnerOnly =
        Array.isArray(operation.security) &&
        (operation.security as Array<Record<string, unknown>>).every((scheme) =>
          Object.keys(scheme).every((name) => name === "runnerToken"),
        );
      if (runnerOnly) {
        expect(operation.responses["429"], path).toBeUndefined();
        continue;
      }
      if (!operation.responses["429"])
        missing.push(`${method.toUpperCase()} ${path}`);
    }
    expect(missing).toEqual([]);
    expect(spec.paths["/project"]?.get?.responses["429"]).toEqual({
      $ref: "#/components/responses/ApiKeyRateLimited",
    });
  });

  it("documents the API key rate limit on public routes that read an API key", () => {
    const byId = new Map(
      operations(spec).map(([, , operation]) => [
        operation.operationId,
        operation,
      ]),
    );
    for (const id of ["getSession", "getAsset", "getDeviceAuthorizationPage"]) {
      expect(byId.get(id)?.responses["429"], id).toEqual({
        $ref: "#/components/responses/ApiKeyRateLimited",
      });
    }
    for (const id of [
      "getInstanceStatus",
      "getPublicProject",
      "getUserAvatar",
      "getCalendarFeed",
      "getConfig",
    ]) {
      expect(byId.get(id)?.responses["429"], id).toBeUndefined();
    }
  });
});
