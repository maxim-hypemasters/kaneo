/**
 * The claim attempt a runner request speaks for, from the
 * X-Kaneo-Run-Attempt header. Null when the header is missing or malformed,
 * which the run routes refuse like a superseded attempt.
 */
export function parseRunAttempt(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? "";
  if (!/^[1-9]\d{0,8}$/.test(trimmed)) return null;
  return Number(trimmed);
}
