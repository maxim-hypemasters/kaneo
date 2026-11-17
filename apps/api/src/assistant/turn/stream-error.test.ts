import { describe, expect, it } from "vite-plus/test";
import {
  fromHttpStatus,
  OpenRouterError,
} from "../openrouter/openrouter-error";
import {
  INTERNAL_FAILURE,
  providerErrorToRecord,
  providerFailure,
} from "./stream-error";

describe("providerFailure", () => {
  it.each([
    [401, "OPENROUTER_KEY_INVALID", false],
    [402, "OPENROUTER_CREDITS", false],
    [403, "OPENROUTER_CONTENT_FILTERED", false],
    [429, "OPENROUTER_RATE_LIMITED", true],
    [400, "OPENROUTER_MODEL", false],
    [503, "OPENROUTER_UNAVAILABLE", true],
  ])("maps HTTP %i to %s", (status, code, retryable) => {
    expect(providerFailure(fromHttpStatus(status))).toEqual({
      code,
      retryable,
    });
  });

  it("reports an unreachable OpenRouter as unavailable", () => {
    expect(
      providerFailure(new OpenRouterError("OPENROUTER_UNREACHABLE")),
    ).toEqual({ code: "OPENROUTER_UNAVAILABLE", retryable: true });
  });

  it("leaves other errors to the caller", () => {
    expect(providerFailure(new Error("db down"))).toBeNull();
    expect(providerFailure("text")).toBeNull();
    expect(
      providerFailure(new DOMException("aborted", "AbortError")),
    ).toBeNull();
  });

  it("never carries a message", () => {
    expect(
      Object.keys(providerFailure(fromHttpStatus(500)) ?? {}).sort(),
    ).toEqual(["code", "retryable"]);
    expect(Object.keys(INTERNAL_FAILURE).sort()).toEqual(["code", "retryable"]);
  });
});

describe("providerErrorToRecord", () => {
  it("records only a rejected key and missing credits", () => {
    expect(providerErrorToRecord("OPENROUTER_KEY_INVALID")).toBe(
      "OPENROUTER_KEY_INVALID",
    );
    expect(providerErrorToRecord("OPENROUTER_CREDITS")).toBe(
      "OPENROUTER_CREDITS",
    );
    expect(providerErrorToRecord("OPENROUTER_RATE_LIMITED")).toBeNull();
    expect(providerErrorToRecord("ASSISTANT_INTERNAL")).toBeNull();
  });
});
