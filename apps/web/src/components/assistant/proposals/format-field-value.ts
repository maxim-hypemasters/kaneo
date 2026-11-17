import type { ProposalField } from "./visible-fields";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
// Due dates are often stored as midnight UTC: a day, not a moment.
const UTC_MIDNIGHT =
  /^(\d{4})-(\d{2})-(\d{2})T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)$/;

function format(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

function formatDate(value: string, locale: string): string {
  const day = DATE_ONLY.exec(value) ?? UTC_MIDNIGHT.exec(value);
  if (day) {
    const [, year, month, date] = day;
    return format(
      new Date(Number(year), Number(month) - 1, Number(date)),
      locale,
      { dateStyle: "medium" },
    );
  }
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return value;
  return format(moment, locale, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * How a card shows a value: dates in the reader's locale (a calendar day
 * without a time), anything else as the server described it. Values that
 * don't parse stay as they are.
 */
export function formatFieldValue(
  kind: ProposalField["kind"],
  value: string,
  locale: string,
): string {
  return kind === "date" && value ? formatDate(value, locale) : value;
}
