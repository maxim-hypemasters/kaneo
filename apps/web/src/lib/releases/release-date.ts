import { format, parseISO } from "date-fns";
import i18n from "i18next";

// Release dates are calendar days (YYYY-MM-DD) with no time zone. Parsed to
// local midnight, a day stays the same day wherever the viewer is.
export function parseReleaseDate(day: string) {
  return parseISO(day);
}

export function toReleaseDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

type FormatOptions = {
  locale?: string;
  // The viewer's local day (YYYY-MM-DD); the year shows for other years.
  today?: string;
};

function formatter(days: readonly string[], options: FormatOptions) {
  const year = (options.today ?? toReleaseDate(new Date())).slice(0, 4);
  return new Intl.DateTimeFormat(
    options.locale || i18n.resolvedLanguage || i18n.language || "en-US",
    {
      month: "short",
      day: "numeric",
      ...(days.some((day) => !day.startsWith(year))
        ? { year: "numeric" as const }
        : {}),
    },
  );
}

export function formatReleaseDate(day: string, options: FormatOptions = {}) {
  return formatter([day], options).format(parseReleaseDate(day));
}

// "Oct 1 – 20", or "Dec 15, 2026 – Jan 9, 2027" across years.
export function formatReleaseRange(
  startDate: string,
  endDate: string,
  options: FormatOptions = {},
) {
  return formatter([startDate, endDate], options).formatRange(
    parseReleaseDate(startDate),
    parseReleaseDate(endDate),
  );
}
