import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import {
  approverRead,
  approverWrite,
  workspaceCreate,
} from "../route-middleware";
import { decideTimeOffBody, workspaceParams } from "../schema";
import { timeOffViewer } from "../viewer";
import { cancelHolidayCalendarRequest } from "./requests/cancel-holiday-calendar-request";
import { decideHolidayCalendarRequest } from "./requests/decide-holiday-calendar-request";
import { listHolidayCalendarRequests } from "./requests/list-holiday-calendar-requests";
import {
  holidayCalendarRequestParams,
  holidayCalendarRequestSchema,
  langQuery,
  pendingHolidayCalendarRequestListSchema,
} from "./schema";

const readErrors = {
  400: errorResponse("Invalid request"),
  403: errorResponse("No access or missing permission"),
  404: errorResponse("Workspace or holiday calendar request not found"),
};
const errors = {
  ...readErrors,
  402: errorResponse("Workspace plan expired"),
  409: errorResponse(
    "Already decided or cancelled (TIME_OFF_STATUS), or changed since review (TIME_OFF_CHANGED)",
  ),
};
const tags = ["Time off"];
const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

const MEMBERS_ONLY =
  "Approver actions need workspace membership as well as time_off:approve.";
const DECIDE = `Send the version you reviewed: a change by the member since then returns 409 TIME_OFF_CHANGED, and a request no longer pending returns 409 TIME_OFF_STATUS. You may decide your own requests. Needs time_off:approve. ${MEMBERS_ONLY}`;

const holidayRequestRoutes = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "listHolidayCalendarRequests",
      path: "/workspace/{workspaceId}/holiday-calendar-requests",
      tags,
      summary: "List pending holiday calendar requests",
      description: `Current members' public holiday calendar changes waiting for approval, oldest first, each with the calendar it would replace. Names are in lang. Needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...approverRead],
      request: { params: workspaceParams, query: langQuery },
      responses: {
        200: jsonResponse(
          "Pending requests",
          pendingHolidayCalendarRequestListSchema,
        ),
        ...readErrors,
      },
    }),
    async (c) =>
      c.json(
        await listHolidayCalendarRequests(
          await timeOffViewer(c),
          c.req.valid("query").lang,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "approveHolidayCalendarRequest",
      path: "/workspace/{workspaceId}/holiday-calendar-requests/{requestId}/approve",
      tags,
      summary: "Approve a holiday calendar request",
      description: `Applies the calendar the member asked for, or No calendar, like an approver setting it: plans that include the member become outdated. A calendar the holiday data no longer knows returns 400 TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN; decline it instead. ${DECIDE}`,
      middleware: [...approverWrite],
      request: {
        params: holidayCalendarRequestParams,
        query: langQuery,
        body: json(decideTimeOffBody),
      },
      responses: {
        200: jsonResponse("Approved request", holidayCalendarRequestSchema),
        ...errors,
        400: errorResponse(
          "Invalid request, or a calendar the holiday data no longer knows (TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN)",
        ),
      },
    }),
    async (c) =>
      c.json(
        await decideHolidayCalendarRequest(
          await timeOffViewer(c),
          c.req.valid("param").requestId,
          "approved",
          c.req.valid("json").version,
          c.req.valid("query").lang,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "declineHolidayCalendarRequest",
      path: "/workspace/{workspaceId}/holiday-calendar-requests/{requestId}/decline",
      tags,
      summary: "Decline a holiday calendar request",
      description: `Keeps the member's calendar as it is. ${DECIDE}`,
      middleware: [...approverWrite],
      request: {
        params: holidayCalendarRequestParams,
        query: langQuery,
        body: json(decideTimeOffBody),
      },
      responses: {
        200: jsonResponse("Declined request", holidayCalendarRequestSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await decideHolidayCalendarRequest(
          await timeOffViewer(c),
          c.req.valid("param").requestId,
          "declined",
          c.req.valid("json").version,
          c.req.valid("query").lang,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "cancelHolidayCalendarRequest",
      path: "/workspace/{workspaceId}/holiday-calendar-requests/{requestId}/cancel",
      tags,
      summary: "Withdraw a holiday calendar request",
      description: `Cancels a pending request; the calendar stays as it is. Your own needs time_off:create; anyone else's needs time_off:approve. A request no longer pending returns 409 TIME_OFF_STATUS. ${MEMBERS_ONLY}`,
      middleware: [...workspaceCreate],
      request: { params: holidayCalendarRequestParams },
      responses: {
        200: jsonResponse("Cancelled request", holidayCalendarRequestSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await cancelHolidayCalendarRequest(
          await timeOffViewer(c),
          c.req.valid("param").requestId,
        ),
        200,
      ),
  );

export default holidayRequestRoutes;
