import { describe, expect, it } from "vite-plus/test";
import { ApiError } from "../errors/api-error";
import { assistantError, openRouterRequestError } from "./errors";
import { OpenRouterError } from "./openrouter/openrouter-error";

describe("assistantError", () => {
  it.each([
    ["ASSISTANT_DISABLED", 404],
    ["ASSISTANT_KEY_UNREADABLE", 409],
    ["ASSISTANT_DAILY_LIMIT", 429],
    ["OPENROUTER_KEY_REQUIRED", 400],
    ["UNSUPPORTED_CONTENT_TYPE", 400],
    ["OPENROUTER_UNREACHABLE", 502],
  ] as const)("builds %s with status %i", (code, status) => {
    const error = assistantError(code);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).not.toBe("");
  });
});

describe("openRouterRequestError", () => {
  it("keeps a rejected key as the caller's error", () => {
    const error = openRouterRequestError(
      new OpenRouterError("OPENROUTER_KEY_INVALID", { status: 401 }),
    );
    expect(error).toMatchObject({
      status: 400,
      code: "OPENROUTER_KEY_INVALID",
    });
  });

  it.each(["OPENROUTER_UNREACHABLE", "OPENROUTER_CREDITS"] as const)(
    "reports %s as unreachable",
    (code) => {
      expect(openRouterRequestError(new OpenRouterError(code))).toMatchObject({
        status: 502,
        code: "OPENROUTER_UNREACHABLE",
      });
    },
  );

  it("rethrows anything that isn't an OpenRouter error", () => {
    const bug = new TypeError("bug");
    expect(() => openRouterRequestError(bug)).toThrow(bug);
  });
});
