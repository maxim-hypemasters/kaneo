import { responseTimestamp, z } from "../../openapi";
import { holidayLang, memberId, workspaceParams, year } from "../schema";
import { TIME_OFF_STATUSES } from "../time-off-kinds";

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,10}$/);
const country = code.openapi({
  description:
    "Country code from GET holiday-countries, such as DE. Case does not matter.",
});
const region = code.openapi({
  description:
    "Region code from GET holiday-countries/{country}/regions, such as BY. Case does not matter.",
});

export const langQuery = z.object({ lang: holidayLang });
export const regionsParams = workspaceParams.extend({ country });
export const memberHolidaysQuery = z.object({
  userId: memberId,
  year,
  lang: holidayLang,
});
export const setHolidayCalendarBody = z
  .object({
    userId: z.string().min(1).optional().openapi({
      description:
        "Member whose calendar to set. Defaults to you (time_off:create); anyone else needs time_off:approve.",
    }),
    country,
    region: region.nullable().optional().openapi({
      description: "Optional region. Null or omitted means the whole country.",
    }),
  })
  .strict();
export const clearHolidayCalendarQuery = z.object({
  userId: z.string().min(1).optional().openapi({
    description:
      "Member whose calendar to clear. Defaults to you (time_off:create); anyone else needs time_off:approve.",
  }),
  lang: holidayLang,
});
export const holidayCalendarRequestParams = workspaceParams.extend({
  requestId: z.string().min(1),
});

const option = z.object({ code: z.string(), name: z.string() });

export const holidayCountryListSchema = z
  .object({
    workspaceId: z.string(),
    countries: z.array(option).openapi({
      description: "Every country with holiday data, sorted by name.",
    }),
  })
  .openapi("HolidayCountryList");

export const holidayRegionListSchema = z
  .object({
    workspaceId: z.string(),
    country: z.string(),
    regions: z.array(option).openapi({
      description:
        "The country's regions, sorted by name; empty when it has none.",
    }),
  })
  .openapi("HolidayRegionList");

export const holidayCalendarSchema = z
  .object({
    country: z.string(),
    countryName: z.string(),
    region: z.string().nullable(),
    regionName: z.string().nullable(),
  })
  .openapi("HolidayCalendar", {
    description:
      "A member's public holiday calendar: a country and optional region.",
  });

const requestShape = {
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string().openapi({
    description: "The member whose calendar would change.",
  }),
  status: z.enum(TIME_OFF_STATUSES),
  version: z.number().int().openapi({
    description:
      "Incremented each time the member changes the request. Approve and decline must send it.",
  }),
  calendar: holidayCalendarSchema.nullable().openapi({
    description: "The calendar asked for; null asks for no calendar.",
  }),
  createdAt: responseTimestamp,
  updatedAt: responseTimestamp.openapi({
    description: "When the member last changed the request.",
  }),
};

export const holidayCalendarRequestSchema = z
  .object(requestShape)
  .openapi("HolidayCalendarRequest", {
    description:
      "A member's request to change their public holiday calendar. Visible only to the member and to approvers.",
  });

export const pendingHolidayCalendarRequestListSchema = z
  .object({
    workspaceId: z.string(),
    requests: z.array(
      z.object({
        ...requestShape,
        currentCalendar: holidayCalendarSchema.nullable().openapi({
          description: "The calendar the request would replace, or null.",
        }),
      }),
    ),
  })
  .openapi("PendingHolidayCalendarRequestList");

const pendingRequest = holidayCalendarRequestSchema.nullable().openapi({
  description:
    "The member's calendar change waiting for approval, or null. At most one is pending.",
});

export const memberHolidaysSchema = z
  .object({
    workspaceId: z.string(),
    userId: z.string(),
    year: z.number().int(),
    calendar: holidayCalendarSchema.nullable().openapi({
      description: "Null when the member has no calendar.",
    }),
    calendarChosen: z.boolean().openapi({
      description:
        "Whether the member's calendar choice is made, No calendar included. Their first choice is free on or before the deadline.",
    }),
    pendingRequest,
    holidayCalendarDeadline: z.string().nullable().openapi({
      format: "date",
      description:
        "The workspace's last UTC day for a free first choice, inclusive; null without a deadline.",
    }),
    nextChangeNeedsApproval: z.boolean().openapi({
      description:
        "Whether your next change to this calendar becomes a request for approval instead of applying at once.",
    }),
    holidays: z
      .array(
        z.object({
          date: z.string().openapi({ format: "date" }),
          name: z.string(),
        }),
      )
      .openapi({
        description:
          "The calendar's public holidays in the year, by date, weekends included. Only weekdays count as used public_holiday days.",
      }),
  })
  .openapi("MemberHolidays");

export const holidayCalendarResultSchema = z
  .object({
    workspaceId: z.string(),
    userId: z.string(),
    status: z.enum(["applied", "pending"]).openapi({
      description:
        "applied: the calendar in effect is the one you sent. pending: the change waits for approval in pendingRequest.",
    }),
    calendar: holidayCalendarSchema.nullable().openapi({
      description: "The calendar in effect, or null for no calendar.",
    }),
    pendingRequest,
  })
  .openapi("HolidayCalendarResult");

export type SetHolidayCalendarInput = z.infer<typeof setHolidayCalendarBody>;
