import { useTranslation } from "react-i18next";

// The locale dates and weekday names are formatted in.
export function useTimeOffFormatLocale() {
  const { i18n } = useTranslation();
  return i18n?.resolvedLanguage || i18n?.language || "en-US";
}
