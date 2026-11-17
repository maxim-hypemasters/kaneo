import { listHolidayCountries } from "./catalog";

export function holidayCountryList(workspaceId: string, lang?: string) {
  return { workspaceId, countries: [...listHolidayCountries(lang)] };
}
