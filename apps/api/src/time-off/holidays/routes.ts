import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { ownRead, workspaceCreate } from "../route-middleware";
import { workspaceParams } from "../schema";
import { timeOffViewer } from "../viewer";
import { clearHolidayCalendar } from "./clear-holiday-calendar";
import { getMemberHolidays } from "./get-member-holidays";
import { holidayCountryList } from "./holiday-country-list";
import { holidayRegionList } from "./holiday-region-list";
import {
  clearHolidayCalendarQuery,
  holidayCalendarResultSchema,
  holidayCountryListSchema,
  holidayRegionListSchema,
  langQuery,
  memberHolidaysQuery,
  memberHolidaysSchema,
  regionsParams,
  setHolidayCalendarBody,
} from "./schema";
import { setHolidayCalendar } from "./set-holiday-calendar";

const readErrors = {
  400: errorResponse("Invalid request"),
  403: errorResponse("No access or missing permission"),
  404: errorResponse("Workspace, member or country not found"),
};
const writeErrors = {
  ...readErrors,
  400: errorResponse(
    "Invalid request, or an unknown country or region (TIME_OFF_HOLIDAY_CALENDAR_UNKNOWN)",
  ),
  402: errorResponse("Workspace plan expired"),
};
const tags = ["Time off"];

const SOURCE =
  "Holiday data ships with Kaneo (date-holidays); only public holidays are used, not bank, school or optional days.";
const EFFECT =
  "An applied calendar's holidays count as approved time off without requests, leave the member's other requests' working days, and count as used public_holiday days on weekdays. Plans that include the member become outdated.";
const RULES =
  "A member's first choice, No calendar included, applies at once on or before the workspace's holiday calendar deadline (a UTC day that counts), or at any time without a deadline. Every later change by the member, and any choice after the deadline, returns status \"pending\" and waits for an approver; sending another change updates the pending request, and POST holiday-calendar-requests/{requestId}/cancel or sending your current calendar withdraws it. Changes by approvers, for themselves or for another member, apply at once; applying the calendar a member asked for approves their request, and re-saving their current calendar leaves it pending.";
const WHO =
  "Your own needs time_off:create; another current member's needs time_off:approve and membership.";

const holidayRoutes = apiRouter()
  .openapi(
    createRoute({
      method: "get",
      operationId: "listHolidayCountries",
      path: "/workspace/{workspaceId}/holiday-countries",
      tags,
      summary: "List holiday calendar countries",
      description: `Countries a member can pick as their public holiday calendar, with names in lang. ${SOURCE} Needs any time_off permission.`,
      middleware: [...ownRead],
      request: { params: workspaceParams, query: langQuery },
      responses: {
        200: jsonResponse("Countries", holidayCountryListSchema),
        ...readErrors,
      },
    }),
    (c) =>
      c.json(
        holidayCountryList(
          c.req.valid("param").workspaceId,
          c.req.valid("query").lang,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listHolidayRegions",
      path: "/workspace/{workspaceId}/holiday-countries/{country}/regions",
      tags,
      summary: "List a holiday calendar country's regions",
      description:
        "Regions (states or provinces) with their own public holidays, with names in lang; empty when the country has none. An unknown country returns 404. Needs any time_off permission.",
      middleware: [...ownRead],
      request: { params: regionsParams, query: langQuery },
      responses: {
        200: jsonResponse("Regions", holidayRegionListSchema),
        ...readErrors,
      },
    }),
    (c) =>
      c.json(
        holidayRegionList(
          c.req.valid("param").workspaceId,
          c.req.valid("param").country,
          c.req.valid("query").lang,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      operationId: "listMemberHolidays",
      path: "/workspace/{workspaceId}/holidays",
      tags,
      summary: "Read a member's public holiday calendar",
      description:
        "The member's calendar, or null, and its public holidays in one Jan-Dec year with names in lang, weekends included. Also whether the calendar choice is made, the change waiting for approval, the workspace's deadline for a free first choice and whether your next change needs approval. Your own needs any time_off permission; another current member's needs time_off:approve and membership.",
      middleware: [...ownRead],
      request: { params: workspaceParams, query: memberHolidaysQuery },
      responses: {
        200: jsonResponse("Calendar and holidays", memberHolidaysSchema),
        ...readErrors,
      },
    }),
    async (c) =>
      c.json(
        await getMemberHolidays(await timeOffViewer(c), c.req.valid("query")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "put",
      operationId: "setHolidayCalendar",
      path: "/workspace/{workspaceId}/holiday-calendar",
      tags,
      summary: "Set a member's public holiday calendar",
      description: `Picks a country and optional region; codes are case-insensitive. ${RULES} ${EFFECT} Members can still request public_holiday time off for other days, such as bank holidays. ${WHO}`,
      middleware: [...workspaceCreate],
      request: {
        params: workspaceParams,
        query: langQuery,
        body: {
          required: true,
          content: { "application/json": { schema: setHolidayCalendarBody } },
        },
      },
      responses: {
        200: jsonResponse(
          "The calendar in effect and any pending change",
          holidayCalendarResultSchema,
        ),
        ...writeErrors,
      },
    }),
    async (c) =>
      c.json(
        await setHolidayCalendar(
          await timeOffViewer(c),
          c.req.valid("json"),
          c.req.valid("query").lang,
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      operationId: "clearHolidayCalendar",
      path: "/workspace/{workspaceId}/holiday-calendar",
      tags,
      summary: "Clear a member's public holiday calendar",
      description: `Sets No calendar, so the member enters public holidays as requests again; the choice stays recorded. ${RULES} Once it applies, plans that include the member become outdated. ${WHO}`,
      middleware: [...workspaceCreate],
      request: { params: workspaceParams, query: clearHolidayCalendarQuery },
      responses: {
        200: jsonResponse(
          "The calendar in effect and any pending change",
          holidayCalendarResultSchema,
        ),
        ...writeErrors,
      },
    }),
    async (c) =>
      c.json(
        await clearHolidayCalendar(
          await timeOffViewer(c),
          c.req.valid("query"),
        ),
        200,
      ),
  );

export default holidayRoutes;
