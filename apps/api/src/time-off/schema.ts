import {
  nullableResponseTimestamp,
  pagingNumber,
  responseTimestamp,
  z,
} from "../openapi";
import { isoDay } from "../release/release-dates";
import { MAX_RANGE_DAYS, NOTE_MAX } from "./constants";
import {
  TIME_OFF_STATUSES,
  TIME_OFF_TYPES,
  type TimeOffType,
} from "./time-off-kinds";

const type = z.enum(TIME_OFF_TYPES).openapi({
  description:
    "vacation, sick (a sick day) or public_holiday. Each type has its own yearly allowance.",
});

// One field per time off type.
const perType = <T extends z.ZodType>(schema: T) =>
  z.object({
    vacation: schema,
    sick: schema,
    public_holiday: schema,
  } satisfies Record<TimeOffType, T>);

export const workspaceParams = z.object({ workspaceId: z.string().min(1) });
export const timeOffParams = z.object({ id: z.string().min(1) });
export const typeAllowanceParams = z.object({
  workspaceId: z.string().min(1),
  type,
});
export const memberAllowanceParams = typeAllowanceParams.extend({
  userId: z.string().min(1),
});

export const year = pagingNumber(1970, 9999).optional().openapi({
  description: "Jan-Dec allowance year. Defaults to the current UTC year.",
});
export const memberId = z.string().min(1).optional().openapi({
  description:
    "Member to read. Defaults to you; anyone else needs time_off:approve.",
});
export const holidayLang = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/)
  .optional()
  .openapi({
    description:
      "Language of holiday names, such as de or de-DE. Defaults to en; names without a translation use the country's own language.",
  });

export const calendarQuery = z.object({
  from: isoDay.openapi({ description: "First day of the window." }),
  to: isoDay.openapi({
    description: `Last day of the window, at most ${MAX_RANGE_DAYS} days after from.`,
  }),
  lang: holidayLang,
});
export const memberYearQuery = z.object({ userId: memberId, year });
export const yearQuery = z.object({ year });

const note = z
  .string()
  .trim()
  .max(NOTE_MAX)
  .openapi({
    description: `Up to ${NOTE_MAX} characters, trimmed. Visible to the person away and to approvers only.`,
  });
const startDate = isoDay.openapi({ description: "First day away, inclusive." });
const endDate = isoDay.openapi({
  description: "Last day away, inclusive. On or after the start date.",
});

export const createTimeOffBody = z
  .object({
    userId: z.string().min(1).optional().openapi({
      description:
        "Record time off for another current member. Needs time_off:approve; omit it to request for yourself.",
    }),
    type,
    startDate,
    endDate,
    note: note.optional(),
  })
  .strict();

export const updateTimeOffBody = z
  .object({
    type: type.optional(),
    startDate: startDate.optional(),
    endDate: endDate.optional(),
    note: note.nullable().optional().openapi({
      description: "Null or an empty string clears the note.",
    }),
  })
  .strict()
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    "At least one field is required",
  );

export const decideTimeOffBody = z
  .object({
    version: z.number().int().min(0).openapi({
      description:
        "The request version you reviewed. A request edited since then returns 409 TIME_OFF_CHANGED.",
    }),
  })
  .strict();

export const allowanceBody = z
  .object({
    days: z.number().int().min(0).max(366).openapi({
      description:
        "Working days of this type allowed per Jan-Dec year, applied to every year.",
    }),
  })
  .strict();

const yearDays = z.object({
  year: z.number().int(),
  days: z.number().int(),
});

const requestShape = {
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string().openapi({ description: "The person away." }),
  type,
  status: z.enum(TIME_OFF_STATUSES),
  startDate: z.string().openapi({ format: "date" }),
  endDate: z.string().openapi({ format: "date" }),
  days: z.number().int().openapi({
    description:
      "Working days in the range: Monday to Friday, leaving out the member's calendar public holidays.",
  }),
  daysByYear: z.array(yearDays).openapi({
    description:
      "Working days per allowance year. Years the range touches only on weekends or holidays are left out.",
  }),
  note: z.string().nullable(),
  version: z.number().int().openapi({
    description: "Incremented by every edit. Approve and decline must send it.",
  }),
  createdBy: z.string().nullable(),
  statusChangedBy: z.string().nullable(),
  statusChangedAt: nullableResponseTimestamp,
  createdAt: responseTimestamp,
  updatedAt: responseTimestamp,
  canEdit: z.boolean(),
  canCancel: z.boolean(),
  canDecide: z.boolean(),
};

export const timeOffRequestSchema = z
  .object(requestShape)
  .openapi("TimeOffRequest");

export const timeOffEntrySchema = z
  .object(requestShape)
  .partial()
  .required({ id: true, userId: true, startDate: true, endDate: true })
  .openapi("TimeOffEntry", {
    description:
      "Who is away and when. Type, status, note, days, version and the action flags appear only on your own entries, or on every entry when you hold time_off:approve.",
  });

export const timeOffTypeBalanceSchema = z
  .object({
    allowanceDays: z.number().int(),
    allowanceSource: z.enum(["default", "override"]),
    usedDays: z.number().int().openapi({
      description:
        "Approved working days of this type in the year; the member's calendar holidays never count. For public_holiday it also includes the weekday holidays of their calendar.",
    }),
    pendingDays: z.number().int().openapi({
      description:
        "Pending working days of this type in the year, not subtracted.",
    }),
    remainingDays: z.number().int().openapi({
      description: "allowanceDays - usedDays. Negative when over.",
    }),
  })
  .openapi("TimeOffTypeBalance");

export const timeOffBalanceSchema = z
  .object({
    workspaceId: z.string(),
    userId: z.string(),
    year: z.number().int(),
    types: perType(timeOffTypeBalanceSchema).openapi({
      description: "One balance per type; each type has its own allowance.",
    }),
  })
  .openapi("TimeOffBalance");

export const timeOffHolidaySchema = z
  .object({
    userId: z.string(),
    date: z.string().openapi({ format: "date" }),
    name: z.string().optional().openapi({
      description:
        "The holiday's name. Present only on your own holidays, or on everyone's when you hold time_off:approve and are a member.",
    }),
  })
  .openapi("TimeOffHoliday", {
    description:
      "One day of a current member's public holiday calendar. It counts as approved time off; weekends included.",
  });

export const timeOffCalendarSchema = z
  .object({
    workspaceId: z.string(),
    from: z.string().openapi({ format: "date" }),
    to: z.string().openapi({ format: "date" }),
    entries: z.array(timeOffEntrySchema),
    holidays: z.array(timeOffHolidaySchema).openapi({
      description:
        "Calendar public holidays of current members inside from-to, by date then member.",
    }),
  })
  .openapi("TimeOffCalendar");

export const timeOffRequestListSchema = z
  .object({
    workspaceId: z.string(),
    requests: z.array(timeOffRequestSchema),
  })
  .openapi("TimeOffRequestList");

export const pendingTimeOffListSchema = z
  .object({
    workspaceId: z.string(),
    requests: z.array(
      z.object({
        ...requestShape,
        balances: z.array(timeOffBalanceSchema).openapi({
          description:
            "The requester's balance for each year the range touches.",
        }),
        overAllowanceDays: z.array(yearDays).openapi({
          description:
            "Per year, how far approving this request alone would go past the allowance of the request's own type: max(0, used + days in the year - allowance).",
        }),
      }),
    ),
  })
  .openapi("PendingTimeOffList");

const defaultAllowances = perType(z.number().int()).openapi({
  description: "The workspace default allowance of each type.",
});

export const timeOffBalancesSchema = z
  .object({
    workspaceId: z.string(),
    year: z.number().int(),
    defaultAllowances,
    members: z.array(timeOffBalanceSchema),
  })
  .openapi("TimeOffBalances");

export const timeOffRequestResultSchema = z
  .object({
    workspaceId: z.string(),
    request: timeOffRequestSchema,
    balances: z.array(timeOffBalanceSchema).openapi({
      description:
        "The requester's balances for every type after the change, for every year the old and new ranges touch.",
    }),
  })
  .openapi("TimeOffRequestResult");

export const timeOffAllowanceDefaultSchema = z
  .object({
    workspaceId: z.string(),
    type,
    defaultAllowanceDays: z.number().int(),
  })
  .openapi("TimeOffAllowanceDefault");

export const timeOffAllowanceDefaultsSchema = z
  .object({
    workspaceId: z.string(),
    defaultAllowances,
  })
  .openapi("TimeOffAllowanceDefaults");

export type CreateTimeOffInput = z.infer<typeof createTimeOffBody>;
export type UpdateTimeOffInput = z.infer<typeof updateTimeOffBody>;
