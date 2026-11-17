import type { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";

type Api = (typeof client)["time-off"];
type WorkspaceApi = Api["workspace"][":workspaceId"];

export type TimeOffCalendar = InferResponseType<WorkspaceApi["$get"], 200>;

// Who is away and when. Other members' entries carry only id, userId and
// dates unless the viewer can approve.
export type TimeOffEntry = TimeOffCalendar["entries"][number];

// One day of a member's public holiday calendar. The name shows only on your
// own holidays, or on everyone's when you can approve.
export type TimeOffHoliday = TimeOffCalendar["holidays"][number];

export type TimeOffRequestList = InferResponseType<
  WorkspaceApi["requests"]["$get"],
  200
>;

export type TimeOffRequest = TimeOffRequestList["requests"][number];

export type TimeOffType = TimeOffRequest["type"];

export type TimeOffStatus = TimeOffRequest["status"];

export type PendingTimeOffList = InferResponseType<
  WorkspaceApi["pending"]["$get"],
  200
>;

export type PendingTimeOffRequest = PendingTimeOffList["requests"][number];

export type TimeOffBalance = InferResponseType<
  WorkspaceApi["balance"]["$get"],
  200
>;

// One type's allowance and used, pending and remaining days in a year.
export type TimeOffTypeBalance = TimeOffBalance["types"][TimeOffType];

export type TimeOffBalances = InferResponseType<
  WorkspaceApi["balances"]["$get"],
  200
>;

export type TimeOffRequestResult = InferResponseType<
  Api[":id"]["cancel"]["$post"],
  200
>;

// The workspace default allowance of each type.
export type TimeOffAllowanceDefaults = InferResponseType<
  WorkspaceApi["allowance"]["$get"],
  200
>;

export type TimeOffAllowanceDefault = InferResponseType<
  WorkspaceApi["allowance"][":type"]["$put"],
  200
>;

export type HolidayOption = InferResponseType<
  WorkspaceApi["holiday-countries"]["$get"],
  200
>["countries"][number];

// A member's calendar and its holidays in one year.
export type MemberHolidays = InferResponseType<
  WorkspaceApi["holidays"]["$get"],
  200
>;

// A country and optional region, with display names.
export type HolidayCalendar = NonNullable<MemberHolidays["calendar"]>;

// A member's calendar change waiting for approval; a null calendar asks for
// No calendar.
export type HolidayCalendarRequest = NonNullable<
  MemberHolidays["pendingRequest"]
>;

// A pending change with the calendar it would replace.
export type PendingHolidayCalendarRequest = InferResponseType<
  WorkspaceApi["holiday-calendar-requests"]["$get"],
  200
>["requests"][number];

export type TimeOffSettingsInput = InferRequestType<
  WorkspaceApi["settings"]["$put"]
>["json"];

export type CreateTimeOffInput = InferRequestType<
  WorkspaceApi["$post"]
>["json"];

export type UpdateTimeOffInput = InferRequestType<Api[":id"]["$patch"]>["json"];
