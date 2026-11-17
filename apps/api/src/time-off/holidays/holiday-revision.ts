import { HOLIDAY_DATA_VERSION } from "./holiday-data-version";

// The part of a plan fingerprint that holiday calendars add. Undefined
// without calendars, so JSON fingerprints of older plans stay the same; it
// never depends on today's date.
export function holidayRevision(
  rows: ReadonlyArray<{
    userId: string;
    country: string;
    region: string | null;
  }>,
): string | undefined {
  if (rows.length === 0) return undefined;
  const calendars = [...rows]
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
    .map((row) => `${row.userId}:${row.country}:${row.region ?? ""}`);
  return `${HOLIDAY_DATA_VERSION}|${calendars.join(",")}`;
}
