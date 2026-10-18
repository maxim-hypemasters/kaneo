import { describe, expect, it, vi } from "vite-plus/test";
import { retryTransaction } from "./retry-transaction";

// Drizzle wraps the driver's error, which carries the SQLSTATE.
const pgError = (code: string) =>
  new Error("Failed query", {
    cause: Object.assign(new Error(code), { code }),
  });

describe("retryTransaction", () => {
  it("runs a deadlocked transaction again and returns its result", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(pgError("40P01"))
      .mockResolvedValueOnce("done");

    await expect(retryTransaction(run)).resolves.toBe("done");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries a serialization failure too", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(pgError("40001"))
      .mockResolvedValueOnce("done");

    await expect(retryTransaction(run)).resolves.toBe("done");
  });

  it("gives up after three attempts with the last error", async () => {
    const last = pgError("40P01");
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(pgError("40P01"))
      .mockRejectedValueOnce(pgError("40P01"))
      .mockRejectedValueOnce(last);

    await expect(retryTransaction(run)).rejects.toBe(last);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("throws other errors at once", async () => {
    const error = pgError("23505");
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(retryTransaction(run)).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("retries what the caller's predicate accepts", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(pgError("23503"))
      .mockResolvedValueOnce("done");

    await expect(
      retryTransaction(run, (error) => error instanceof Error),
    ).resolves.toBe("done");
  });
});
