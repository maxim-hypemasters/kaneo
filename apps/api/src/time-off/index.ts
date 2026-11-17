import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { cancelTimeOffRequest } from "./cancel-time-off-request";
import { clearTimeOffAllowanceOverride } from "./clear-time-off-allowance-override";
import { DEFAULT_ALLOWANCE_DAYS } from "./constants";
import { createTimeOffRequest } from "./create-time-off-request";
import { decideTimeOffRequest } from "./decide-time-off-request";
import { getTimeOffAllowanceDefaults } from "./get-time-off-allowance-defaults";
import { getTimeOffBalance } from "./get-time-off-balance";
import { getTimeOffRequest } from "./get-time-off-request";
import holidayRequestRoutes from "./holidays/request-routes";
import holidayRoutes from "./holidays/routes";
import { listPendingTimeOffRequests } from "./list-pending-time-off-requests";
import { listTimeOffBalances } from "./list-time-off-balances";
import { listTimeOffCalendar } from "./list-time-off-calendar";
import { listTimeOffRequests } from "./list-time-off-requests";
import {
  approverRead,
  approverWrite,
  ownRead,
  requestDecide,
  requestRead,
  requestWrite,
  teamRead,
  workspaceCreate,
} from "./route-middleware";
import {
  allowanceBody,
  calendarQuery,
  createTimeOffBody,
  decideTimeOffBody,
  memberAllowanceParams,
  memberYearQuery,
  pendingTimeOffListSchema,
  timeOffAllowanceDefaultSchema,
  timeOffAllowanceDefaultsSchema,
  timeOffBalanceSchema,
  timeOffBalancesSchema,
  timeOffCalendarSchema,
  timeOffParams,
  timeOffRequestListSchema,
  timeOffRequestResultSchema,
  timeOffRequestSchema,
  typeAllowanceParams,
  updateTimeOffBody,
  workspaceParams,
  yearQuery,
} from "./schema";
import { setDefaultTimeOffAllowance } from "./set-default-time-off-allowance";
import { setTimeOffAllowanceOverride } from "./set-time-off-allowance-override";
import settingsRoutes from "./settings/routes";
import { timeOffViewer } from "./viewer";
import { updateTimeOffRequest } from "./update-time-off-request";

const readErrors = {
  400: errorResponse("Invalid request"),
  403: errorResponse("No access or missing permission"),
  404: errorResponse("Workspace, member or request not found"),
};
const errors = {
  ...readErrors,
  402: errorResponse("Workspace plan expired"),
  409: errorResponse(
    "Overlapping days (TIME_OFF_OVERLAP), already decided (TIME_OFF_STATUS), edited since review (TIME_OFF_CHANGED) or past its first day (TIME_OFF_STARTED)",
  ),
};
const tags = ["Time off"];
const json = <T>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

const MEMBERS_ONLY =
  "Approver actions need workspace membership as well as time_off:approve.";
const DEFAULT_ALLOWANCE_TEXT = Object.entries(DEFAULT_ALLOWANCE_DAYS)
  .map(([type, days]) => `${type} ${days}`)
  .join(", ");

const timeOff = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "listTimeOff",
      path: "/workspace/{workspaceId}",
      tags,
      summary: "List who is away",
      description:
        "Time off of current members that overlaps the from-to window (at most 366 days): approved entries, plus pending requests that are your own or, with time_off:approve, everyone's, and holidays: each current member's calendar public holidays inside the window. Needs time_off:read. Other members' entries contain only id, userId, startDate and endDate, and their holidays only userId and date, unless you hold time_off:approve and are a member. Holiday names are in lang.",
      middleware: [...teamRead],
      request: { params: workspaceParams, query: calendarQuery },
      responses: {
        200: jsonResponse("Entries in the window", timeOffCalendarSchema),
        ...readErrors,
      },
    }),
    async (c) =>
      c.json(
        await listTimeOffCalendar(await timeOffViewer(c), c.req.valid("query")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listTimeOffRequests",
      path: "/workspace/{workspaceId}/requests",
      tags,
      summary: "List a member's time off requests",
      description: `Requests of every status that touch the Jan-Dec year, latest start first. Your own need any time_off permission; another member's need time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...ownRead],
      request: { params: workspaceParams, query: memberYearQuery },
      responses: {
        200: jsonResponse("The member's requests", timeOffRequestListSchema),
        ...readErrors,
      },
    }),
    async (c) =>
      c.json(
        await listTimeOffRequests(await timeOffViewer(c), c.req.valid("query")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listPendingTimeOffRequests",
      path: "/workspace/{workspaceId}/pending",
      tags,
      summary: "List time off waiting for approval",
      description: `Pending requests of current members, oldest first, with type and note. Each carries the requester's balances for the years it touches and overAllowanceDays per year. Needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...approverRead],
      request: { params: workspaceParams },
      responses: {
        200: jsonResponse("Pending requests", pendingTimeOffListSchema),
        ...readErrors,
      },
    }),
    async (c) =>
      c.json(await listPendingTimeOffRequests(await timeOffViewer(c)), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "createTimeOffRequest",
      path: "/workspace/{workspaceId}",
      tags,
      summary: "Request time off",
      description: `Creates a pending request for full days, start and end inclusive; every request starts pending, an approver's own too. For yourself it needs time_off:create; with userId it records time off for another current member and needs time_off:approve. Dates must fall between Jan 1 of last year and Dec 31 of next year, span at most 366 days and include a working day: a weekday that is not one of the member's calendar public holidays (400 TIME_OFF_NO_WEEKDAYS). Overlapping your other pending or approved days returns 409 TIME_OFF_OVERLAP. Each type counts against its own allowance; going over it is allowed, and the returned balances show it.`,
      middleware: [...workspaceCreate],
      request: { params: workspaceParams, body: json(createTimeOffBody) },
      responses: {
        200: jsonResponse("Created request", timeOffRequestResultSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await createTimeOffRequest(await timeOffViewer(c), c.req.valid("json")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getTimeOffBalance",
      path: "/workspace/{workspaceId}/balance",
      tags,
      summary: "Read a time off balance",
      description: `Per type, the allowance, used (approved) and pending working days and what remains for one Jan-Dec year. Each type has its own allowance; there is no carry-over. Calendar public holidays never count as days of a request, and their weekdays count as used public_holiday days. Your own needs any time_off permission; another current member's needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...ownRead],
      request: { params: workspaceParams, query: memberYearQuery },
      responses: {
        200: jsonResponse("Balance", timeOffBalanceSchema),
        ...readErrors,
      },
    }),
    async (c) =>
      c.json(
        await getTimeOffBalance(await timeOffViewer(c), c.req.valid("query")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listTimeOffBalances",
      path: "/workspace/{workspaceId}/balances",
      tags,
      summary: "List every member's time off balance",
      description: `Balances of all current members for one Jan-Dec year, with the workspace default allowance of each type. Needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...approverRead],
      request: { params: workspaceParams, query: yearQuery },
      responses: {
        200: jsonResponse("Balances", timeOffBalancesSchema),
        ...readErrors,
      },
    }),
    async (c) =>
      c.json(
        await listTimeOffBalances(await timeOffViewer(c), c.req.valid("query")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getTimeOffAllowanceDefaults",
      path: "/workspace/{workspaceId}/allowance",
      tags,
      summary: "Read the default time off allowances",
      description: `The workspace default of each type: the working days each member may take per Jan-Dec year unless they have an override for that type. Until set: ${DEFAULT_ALLOWANCE_TEXT}. Needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...approverRead],
      request: { params: workspaceParams },
      responses: {
        200: jsonResponse("Default allowances", timeOffAllowanceDefaultsSchema),
        ...readErrors,
      },
    }),
    async (c) =>
      c.json(await getTimeOffAllowanceDefaults(await timeOffViewer(c)), 200),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "setDefaultTimeOffAllowance",
      path: "/workspace/{workspaceId}/allowance/{type}",
      tags,
      summary: "Set the default time off allowance of a type",
      description: `Working days of one type each member may take per Jan-Dec year unless they have an override for it. Until set: ${DEFAULT_ALLOWANCE_TEXT}. It applies to every year, past balances included. Needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...approverWrite],
      request: { params: typeAllowanceParams, body: json(allowanceBody) },
      responses: {
        200: jsonResponse("Default allowance", timeOffAllowanceDefaultSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await setDefaultTimeOffAllowance(
          await timeOffViewer(c),
          c.req.valid("param").type,
          c.req.valid("json").days,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "setTimeOffAllowanceOverride",
      path: "/workspace/{workspaceId}/allowance/{type}/{userId}",
      tags,
      summary: "Set a member's time off allowance of a type",
      description: `Overrides one type's default for one current member, for every year. Other types keep their own allowance. Returns their balances for the current year. Needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...approverWrite],
      request: { params: memberAllowanceParams, body: json(allowanceBody) },
      responses: {
        200: jsonResponse("Current-year balance", timeOffBalanceSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await setTimeOffAllowanceOverride(
          await timeOffViewer(c),
          c.req.valid("param").userId,
          c.req.valid("param").type,
          c.req.valid("json").days,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "clearTimeOffAllowanceOverride",
      path: "/workspace/{workspaceId}/allowance/{type}/{userId}",
      tags,
      summary: "Clear a member's time off allowance of a type",
      description: `Puts a current member back on the workspace default of one type. Clearing a type without an override succeeds. Returns their balances for the current year. Needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...approverWrite],
      request: { params: memberAllowanceParams },
      responses: {
        200: jsonResponse("Current-year balance", timeOffBalanceSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await clearTimeOffAllowanceOverride(
          await timeOffViewer(c),
          c.req.valid("param").userId,
          c.req.valid("param").type,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "getTimeOffRequest",
      path: "/{id}",
      tags,
      summary: "Read a time off request",
      description:
        "Your own request needs any time_off permission. Another member's request needs time_off:approve and membership; without them it returns 404, the same as an unknown id.",
      middleware: [...requestRead],
      request: { params: timeOffParams },
      responses: {
        200: jsonResponse("Request", timeOffRequestSchema),
        ...readErrors,
      },
    }),
    async (c) =>
      c.json(
        await getTimeOffRequest(
          await timeOffViewer(c),
          c.req.valid("param").id,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "patch",
      operationId: "updateTimeOffRequest",
      path: "/{id}",
      tags,
      summary: "Edit a time off request",
      description:
        "Changes type, dates or note and increments version. Requesters with time_off:create edit their pending requests; approvers edit pending or approved ones, and approved time off stays approved. Declined and cancelled requests return 409 TIME_OFF_STATUS. New dates get the same checks as a new request, including 409 TIME_OFF_OVERLAP. Another member's request without time_off:approve returns 404.",
      middleware: [...requestWrite],
      request: { params: timeOffParams, body: json(updateTimeOffBody) },
      responses: {
        200: jsonResponse("Edited request", timeOffRequestResultSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await updateTimeOffRequest(
          await timeOffViewer(c),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "cancelTimeOffRequest",
      path: "/{id}/cancel",
      tags,
      summary: "Cancel a time off request",
      description:
        "Marks the request cancelled and keeps it as history. Requesters with time_off:create cancel pending requests, and approved ones until the end of their first day by the UTC date (409 TIME_OFF_STARTED after that); approvers cancel any pending or approved request. Declined and cancelled requests return 409 TIME_OFF_STATUS. Another member's request without time_off:approve returns 404.",
      middleware: [...requestWrite],
      request: { params: timeOffParams },
      responses: {
        200: jsonResponse("Cancelled request", timeOffRequestResultSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await cancelTimeOffRequest(
          await timeOffViewer(c),
          c.req.valid("param").id,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "approveTimeOffRequest",
      path: "/{id}/approve",
      tags,
      summary: "Approve a time off request",
      description: `Approves a pending request, your own included. Send the version you reviewed: an edit since then returns 409 TIME_OFF_CHANGED, and a request no longer pending returns 409 TIME_OFF_STATUS. Needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...requestDecide],
      request: { params: timeOffParams, body: json(decideTimeOffBody) },
      responses: {
        200: jsonResponse("Approved request", timeOffRequestResultSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await decideTimeOffRequest(
          await timeOffViewer(c),
          c.req.valid("param").id,
          "approved",
          c.req.valid("json").version,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      operationId: "declineTimeOffRequest",
      path: "/{id}/decline",
      tags,
      summary: "Decline a time off request",
      description: `Declines a pending request, your own included. Send the version you reviewed: an edit since then returns 409 TIME_OFF_CHANGED, and a request no longer pending returns 409 TIME_OFF_STATUS. Needs time_off:approve. ${MEMBERS_ONLY}`,
      middleware: [...requestDecide],
      request: { params: timeOffParams, body: json(decideTimeOffBody) },
      responses: {
        200: jsonResponse("Declined request", timeOffRequestResultSchema),
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await decideTimeOffRequest(
          await timeOffViewer(c),
          c.req.valid("param").id,
          "declined",
          c.req.valid("json").version,
        ),
        200,
      ),
  )
  .route("/", holidayRoutes)
  .route("/", holidayRequestRoutes)
  .route("/", settingsRoutes);

export default timeOff;
