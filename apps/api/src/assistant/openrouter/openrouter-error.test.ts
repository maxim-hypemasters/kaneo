import { describe, expect, it } from "vite-plus/test";
import {
  fromHttpStatus,
  fromStreamErrorChunk,
  OpenRouterError,
  parseRetryAfter,
} from "./openrouter-error";

describe("OpenRouterError", () => {
  it("uses a fixed message and retryability per code", () => {
    const error = new OpenRouterError("OPENROUTER_RATE_LIMITED", {
      status: 429,
      retryAfterMs: 2000,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("OpenRouter is rate limiting requests");
    expect(error).toMatchObject({
      name: "OpenRouterError",
      code: "OPENROUTER_RATE_LIMITED",
      retryable: true,
      status: 429,
      retryAfterMs: 2000,
    });
    expect(new OpenRouterError("OPENROUTER_KEY_INVALID").retryable).toBe(false);
  });
});

describe("fromHttpStatus", () => {
  it.each([
    [401, "OPENROUTER_KEY_INVALID", false],
    [402, "OPENROUTER_CREDITS", false],
    [403, "OPENROUTER_CONTENT_FILTERED", false],
    [429, "OPENROUTER_RATE_LIMITED", true],
    [400, "OPENROUTER_MODEL", false],
    [404, "OPENROUTER_MODEL", false],
    [413, "OPENROUTER_MODEL", false],
    [408, "OPENROUTER_UNAVAILABLE", true],
    [500, "OPENROUTER_UNAVAILABLE", true],
    [502, "OPENROUTER_UNAVAILABLE", true],
    [503, "OPENROUTER_UNAVAILABLE", true],
  ])("maps HTTP %i to %s", (status, code, retryable) => {
    const error = fromHttpStatus(status);
    expect(error.code).toBe(code);
    expect(error.retryable).toBe(retryable);
    expect(error.status).toBe(status);
  });

  it("keeps Retry-After as milliseconds", () => {
    expect(fromHttpStatus(429, "3").retryAfterMs).toBe(3000);
    expect(fromHttpStatus(429).retryAfterMs).toBeUndefined();
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");

  it("reads delay seconds and HTTP dates", () => {
    expect(parseRetryAfter("0", now)).toBe(0);
    expect(parseRetryAfter(" 12 ", now)).toBe(12_000);
    expect(parseRetryAfter("Mon, 16 Nov 2026 12:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter("Mon, 16 Nov 2026 11:00:00 GMT", now)).toBe(0);
  });

  it("ignores missing or unreadable values", () => {
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter("", now)).toBeUndefined();
    expect(parseRetryAfter("soon", now)).toBeUndefined();
    expect(parseRetryAfter("-5", now)).toBeUndefined();
  });
});

describe("fromStreamErrorChunk", () => {
  it.each([
    [{ error: { code: 402, message: "x" } }, "OPENROUTER_CREDITS"],
    [{ error: { code: "429" } }, "OPENROUTER_RATE_LIMITED"],
    [{ error: { code: "rate_limit_exceeded" } }, "OPENROUTER_RATE_LIMITED"],
    [{ error: { code: "insufficient_quota" } }, "OPENROUTER_CREDITS"],
    [{ error: { code: "content_filter" } }, "OPENROUTER_CONTENT_FILTERED"],
    [{ error: { code: "invalid_api_key" } }, "OPENROUTER_KEY_INVALID"],
    [{ error: { code: "context_length_exceeded" } }, "OPENROUTER_MODEL"],
    [{ error: { code: "server_error" } }, "OPENROUTER_UNAVAILABLE"],
    [{ error: { message: "no code" } }, "OPENROUTER_UNAVAILABLE"],
    [{ choices: [{ finish_reason: "error" }] }, "OPENROUTER_UNAVAILABLE"],
    [null, "OPENROUTER_UNAVAILABLE"],
    ["error", "OPENROUTER_UNAVAILABLE"],
  ])("maps %j to %s", (chunk, code) => {
    expect(fromStreamErrorChunk(chunk).code).toBe(code);
  });

  it("never carries the upstream message", () => {
    const error = fromStreamErrorChunk({
      error: { code: 500, message: "secret prompt text sk-or-v1-abc" },
    });
    expect(error.message).not.toContain("secret");
    expect(error.message).not.toContain("sk-or");
  });
});
