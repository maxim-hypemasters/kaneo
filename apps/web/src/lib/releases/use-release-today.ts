import { useLocalDay } from "@/hooks/use-local-day";
import { toReleaseDate } from "./release-date";

// The viewer's local day as YYYY-MM-DD, for release phases and countdowns. It
// changes at midnight.
export function useReleaseToday() {
  return toReleaseDate(new Date(useLocalDay()));
}
