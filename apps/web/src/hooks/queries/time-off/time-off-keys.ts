// Every time-off query sits under ["time-off", workspaceId], so one
// invalidation (a mutation or a TIME_OFF_UPDATED socket message) refreshes
// the timeline, requests, balances and approvals together. Each hook sets
// refetchOnMount: the app default would show an invalidated entry as current
// when a tab or page mounts it again.
export const timeOffKey = (workspaceId: string) =>
  ["time-off", workspaceId] as const;

// `lang` is the holiday names' language.
export const timeOffCalendarKey = (
  workspaceId: string,
  from: string,
  to: string,
  lang?: string,
) => [...timeOffKey(workspaceId), "calendar", from, to, lang] as const;

// A whole Jan-Dec year of the calendar, shared by the Gantt and the task date
// pickers. `lang` is the holiday names' language.
export const timeOffYearKey = (
  workspaceId: string,
  year: number,
  lang?: string,
) => [...timeOffKey(workspaceId), "year", year, lang] as const;

// Who is away from today on, for the away badges in pickers and on the
// Members page. Its own entry, apart from the Team tab's months.
export const timeOffAwayKey = (workspaceId: string, from: string, to: string) =>
  [...timeOffKey(workspaceId), "away", from, to] as const;

// "me" stands for the viewer, whose own routes need no userId.
export const timeOffRequestsKey = (
  workspaceId: string,
  year: number,
  userId = "me",
) => [...timeOffKey(workspaceId), "requests", year, userId] as const;

export const timeOffRequestKey = (workspaceId: string, id: string) =>
  [...timeOffKey(workspaceId), "request", id] as const;

export const pendingTimeOffKey = (workspaceId: string) =>
  [...timeOffKey(workspaceId), "pending"] as const;

export const timeOffBalanceKey = (
  workspaceId: string,
  year: number,
  userId = "me",
) => [...timeOffKey(workspaceId), "balance", year, userId] as const;

export const timeOffBalancesKey = (workspaceId: string, year: number) =>
  [...timeOffKey(workspaceId), "balances", year] as const;

export const timeOffAllowanceDefaultsKey = (workspaceId: string) =>
  [...timeOffKey(workspaceId), "allowance-defaults"] as const;

// Calendar changes waiting for approval. `lang` is the calendar names'
// language; the Approvals tab and its label pass the same one.
export const holidayCalendarRequestsKey = (
  workspaceId: string,
  lang?: string,
) => [...timeOffKey(workspaceId), "holiday-calendar-requests", lang] as const;

// The workspace's time off settings, such as the holiday calendar deadline.
export const timeOffSettingsKey = (workspaceId: string) =>
  [...timeOffKey(workspaceId), "settings"] as const;

export const timeOffHolidayCountriesKey = (
  workspaceId: string,
  lang?: string,
) => [...timeOffKey(workspaceId), "holiday-countries", lang] as const;

export const timeOffHolidayRegionsKey = (
  workspaceId: string,
  country: string,
  lang?: string,
) => [...timeOffKey(workspaceId), "holiday-regions", country, lang] as const;

// One member's calendar and holidays in a Jan-Dec year.
export const timeOffHolidaysKey = (
  workspaceId: string,
  year: number,
  userId = "me",
  lang?: string,
) => [...timeOffKey(workspaceId), "holidays", year, userId, lang] as const;
