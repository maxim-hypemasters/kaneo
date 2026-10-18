import { pgErrorCode } from "./pg-error-code";

// deadlock_detected and serialization_failure: PostgreSQL rolled the whole
// transaction back because another one got in its way, so running it again
// is safe and usually succeeds.
const CONFLICT_CODES = new Set(["40P01", "40001"]);

export function isTransactionConflict(error: unknown) {
  const code = pgErrorCode(error);
  return code !== undefined && CONFLICT_CODES.has(code);
}
