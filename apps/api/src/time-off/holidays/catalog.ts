import Holidays from "date-holidays";
import { cached } from "../../utils/bounded-cache";
import { holidayLanguage } from "./holiday-language";

export type HolidayOption = { code: string; name: string };

// A member's calendar: a date-holidays country and optional subdivision,
// both uppercase.
export type HolidayCalendarCode = { country: string; region: string | null };

const CACHE_LIMIT = 500;
const catalog = new Holidays();
const countriesCache = new Map<string, readonly HolidayOption[]>();
const regionsCache = new Map<string, readonly HolidayOption[] | null>();

function options(
  names: Readonly<Record<string, string>>,
  lang: string,
): readonly HolidayOption[] {
  return Object.entries(names)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

function hasCountry(country: string) {
  return Object.hasOwn(catalog.getCountries(), country);
}

// Every country with holiday data, sorted by its name in `lang`.
export function listHolidayCountries(lang?: string) {
  const language = holidayLanguage(lang);
  return cached(countriesCache, CACHE_LIMIT, language, () =>
    options(catalog.getCountries(language), language),
  );
}

// A country's subdivisions, [] when it has none, or null for an unknown
// country.
export function listHolidayRegions(country: string, lang?: string) {
  const language = holidayLanguage(lang);
  return cached(regionsCache, CACHE_LIMIT, `${country}|${language}`, () =>
    hasCountry(country)
      ? options(catalog.getStates(country, language) ?? {}, language)
      : null,
  );
}

// Codes are matched exactly; callers uppercase them first.
export function isValidHolidayCalendar({
  country,
  region,
}: HolidayCalendarCode) {
  if (!hasCountry(country)) return false;
  return (
    region === null || Object.hasOwn(catalog.getStates(country) ?? {}, region)
  );
}

// Display names in `lang`. A code the dataset no longer knows shows as the
// code itself.
export function holidayCalendarNames(
  { country, region }: HolidayCalendarCode,
  lang?: string,
) {
  const countryName =
    listHolidayCountries(lang).find((option) => option.code === country)
      ?.name ?? country;
  const regionName =
    region === null
      ? null
      : (listHolidayRegions(country, lang)?.find(
          (option) => option.code === region,
        )?.name ?? region);
  return { countryName, regionName };
}
