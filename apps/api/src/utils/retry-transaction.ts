import { isTransactionConflict } from "./transaction-conflict";

const ATTEMPTS = 3;

// Runs a whole transaction again when it fails with a retryable error, at
// most three times, and then throws the last error. Paths that lock the same
// task rows in different orders can deadlock, and no single order fits them
// all, so PostgreSQL aborting one of them is resolved here. run must only
// write to the database: publish events after it returns.
export async function retryTransaction<T>(
  run: () => Promise<T>,
  isRetryable: (error: unknown) => boolean = isTransactionConflict,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= ATTEMPTS || !isRetryable(error)) throw error;
    }
  }
}
