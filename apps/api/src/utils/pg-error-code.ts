// Drizzle wraps driver errors, so the PostgreSQL fields sit on the cause.
function pgErrorField(error: unknown, field: "code" | "constraint") {
  const cause = error instanceof Error ? (error.cause ?? error) : error;
  if (!cause || typeof cause !== "object" || !(field in cause)) {
    return undefined;
  }
  const value = (cause as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

// The SQLSTATE, such as 23505 for a unique violation.
export const pgErrorCode = (error: unknown) => pgErrorField(error, "code");

// The constraint a violation names.
export const pgErrorConstraint = (error: unknown) =>
  pgErrorField(error, "constraint");
