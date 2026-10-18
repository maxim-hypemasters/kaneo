import { HTTPException } from "hono/http-exception";
import { isTransactionConflict } from "../utils/transaction-conflict";
import { httpExceptionResponse } from "./http-exception-response";

const TRANSACTION_CONFLICT_MESSAGE =
  "This changed at the same time as another edit; try again";

// The response for an error a route throws. Expected failures aren't
// reported: an HTTPException below 500, and a transaction PostgreSQL aborted
// because a concurrent one locked the same rows (rolled back whole, so the
// client can send it again). Anything else is reported and reads as a 500.
export function appErrorResponse(error: Error, report: (error: Error) => void) {
  if (error instanceof HTTPException) {
    if (error.status >= 500) report(error);
    return httpExceptionResponse(error);
  }
  if (isTransactionConflict(error)) {
    return httpExceptionResponse(
      new HTTPException(409, { message: TRANSACTION_CONFLICT_MESSAGE }),
    );
  }
  report(error);
  return httpExceptionResponse(
    new HTTPException(500, { message: "Internal Server Error" }),
  );
}
