import { useTranslation } from "react-i18next";
import type { HolidayCalendar } from "@/fetchers/time-off/types";

// Names a calendar, "Germany · Bavaria" or "Germany", or No calendar for
// null.
export function useHolidayCalendarLabel() {
  const { t } = useTranslation();
  return (calendar: HolidayCalendar | null) => {
    if (!calendar) return t("team:timeOff.holidays.noCalendar");
    return calendar.regionName
      ? t("team:timeOff.holidays.calendarName", {
          country: calendar.countryName,
          region: calendar.regionName,
        })
      : calendar.countryName;
  };
}
