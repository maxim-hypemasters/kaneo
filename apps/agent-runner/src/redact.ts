const MIN_SECRET_LENGTH = 8;

/**
 * Replaces known secret values, and anything shaped like a GitHub or runner
 * token, before text leaves the runner for Kaneo or the logs.
 */
export function createRedactor(secrets: ReadonlyArray<string | null>) {
  const values = secrets
    .filter((value): value is string => Boolean(value))
    .filter((value) => value.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length);
  return (text: string): string => {
    let result = text;
    for (const value of values) result = result.split(value).join("[redacted]");
    return result
      .replace(
        /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
        "[redacted]",
      )
      .replace(/\bkar_[A-Za-z0-9_-]{20,}\b/g, "[redacted]")
      .replace(/\bsk-[A-Za-z0-9-]{20,}\b/g, "[redacted]");
  };
}

export type Redact = ReturnType<typeof createRedactor>;
