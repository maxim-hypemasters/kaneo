export const MAX_ALLOWANCE_DAYS = 366;

export type AllowanceDraftResult =
  | { kind: "unchanged" }
  | { kind: "invalid" }
  // null clears an override, putting the member back on the default.
  | { kind: "save"; days: number | null };

// What committing a typed allowance should do. `draft` is null when nothing
// was typed; `saved` is null when the field shows no value of its own.
export function resolveAllowanceDraft(
  draft: string | null,
  saved: number | null,
  { allowEmpty }: { allowEmpty: boolean },
): AllowanceDraftResult {
  if (draft === null) return { kind: "unchanged" };
  const text = draft.trim();
  if (text === "") {
    if (!allowEmpty) return { kind: "invalid" };
    return saved === null
      ? { kind: "unchanged" }
      : { kind: "save", days: null };
  }
  if (!/^\d+$/.test(text)) return { kind: "invalid" };
  const days = Number(text);
  if (days > MAX_ALLOWANCE_DAYS) return { kind: "invalid" };
  return days === saved ? { kind: "unchanged" } : { kind: "save", days };
}
