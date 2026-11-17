// date-holidays keys a few languages by codes that are not ISO 639-1.
const DATASET_CODES: Readonly<Record<string, string>> = {
  ja: "jp",
  cs: "cz",
  ka: "ge",
};

// The date-holidays language for a tag such as de or pt-BR: the base subtag,
// lowercased, or en when the tag is missing or malformed.
export function holidayLanguage(lang?: string): string {
  const base = lang?.trim().split(/[-_]/)[0]?.toLowerCase() ?? "";
  if (!/^[a-z]{2,3}$/.test(base)) return "en";
  return DATASET_CODES[base] ?? base;
}
