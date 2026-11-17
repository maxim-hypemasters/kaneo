import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { approverRead, approverWrite } from "../route-middleware";
import { workspaceParams } from "../schema";
import { timeOffViewer } from "../viewer";
import { getTimeOffSettings } from "./get-time-off-settings";
import { setTimeOffSettingsBody, timeOffSettingsSchema } from "./schema";
import { setTimeOffSettings } from "./set-time-off-settings";

const readErrors = {
  400: errorResponse("Invalid request"),
  403: errorResponse("No access or missing permission"),
  404: errorResponse("Workspace not found"),
};
const tags = ["Time off"];
const MEMBERS_ONLY =
  "Needs time_off:approve and workspace membership. Members see the deadline that applies to them in GET holidays.";

const settingsRoutes = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "getTimeOffSettings",
      path: "/workspace/{workspaceId}/settings",
      tags,
      summary: "Read the time off settings",
      description: `The workspace's time off settings: the deadline for members' free first public holiday calendar choice. ${MEMBERS_ONLY}`,
      middleware: [...approverRead],
      request: { params: workspaceParams },
      responses: {
        200: jsonResponse("Settings", timeOffSettingsSchema),
        ...readErrors,
      },
    }),
    async (c) => c.json(await getTimeOffSettings(await timeOffViewer(c)), 200),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "setTimeOffSettings",
      path: "/workspace/{workspaceId}/settings",
      tags,
      summary: "Set the time off settings",
      description: `Sets the deadline for members' free first public holiday calendar choice, a UTC day that counts, or null for none. After it, every calendar choice by a member needs approval; changing it leaves pending requests as they are. ${MEMBERS_ONLY}`,
      middleware: [...approverWrite],
      request: {
        params: workspaceParams,
        body: {
          required: true,
          content: { "application/json": { schema: setTimeOffSettingsBody } },
        },
      },
      responses: {
        200: jsonResponse("Settings", timeOffSettingsSchema),
        ...readErrors,
        402: errorResponse("Workspace plan expired"),
      },
    }),
    async (c) =>
      c.json(
        await setTimeOffSettings(await timeOffViewer(c), c.req.valid("json")),
        200,
      ),
  );

export default settingsRoutes;
