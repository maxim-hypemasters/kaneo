import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vite-plus/test";
import { appErrorResponse } from "./app-error-response";

// Drizzle wraps the driver's error, which carries the SQLSTATE.
const pgError = (code: string) =>
  new Error("Failed query", {
    cause: Object.assign(new Error("deadlock detected"), { code }),
  });

describe("appErrorResponse", () => {
  it.each(["40P01", "40001"])(
    "answers a %s abort with a retryable 409 and doesn't report it",
    async (code) => {
      const report = vi.fn();
      const response = await appErrorResponse(pgError(code), report);

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        message: "This changed at the same time as another edit; try again",
        code: "CONFLICT",
      });
      expect(report).not.toHaveBeenCalled();
    },
  );

  it("reads the code from an unwrapped driver error too", async () => {
    const report = vi.fn();
    const error = Object.assign(new Error("deadlock detected"), {
      code: "40P01",
    });

    expect((await appErrorResponse(error, report)).status).toBe(409);
    expect(report).not.toHaveBeenCalled();
  });

  it("reports any other database error as a 500", async () => {
    const report = vi.fn();
    const error = pgError("23505");
    const response = await appErrorResponse(error, report);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(report).toHaveBeenCalledWith(error);
  });

  it("passes expected HTTP errors through without reporting them", async () => {
    const report = vi.fn();
    const response = await appErrorResponse(
      new HTTPException(404, { message: "Task not found" }),
      report,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: "Task not found",
      code: "NOT_FOUND",
    });
    expect(report).not.toHaveBeenCalled();
  });

  it("reports HTTP errors from 500 up", async () => {
    const report = vi.fn();
    const error = new HTTPException(503, { message: "Storage unavailable" });

    expect((await appErrorResponse(error, report)).status).toBe(503);
    expect(report).toHaveBeenCalledWith(error);
  });
});
