import en from "@i18n/en-US.json";
import { describe, expect, it } from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import {
  ASSISTANT_CLIENT_ERROR_CODES,
  ASSISTANT_REQUEST_ERROR_CODES,
  assistantErrorMessageKey,
  failureFromRequestError,
} from "./assistant-error-message";
import { ASSISTANT_STREAM_ERROR_CODES } from "./assistant-stream-event";

function translationExists(key: string) {
  const [namespace, path] = key.split(":");
  let node: unknown = (en as Record<string, unknown>)[namespace];
  for (const part of path.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return typeof node === "string" && node.length > 0;
}

describe("assistantErrorMessageKey", () => {
  it.each([
    ...ASSISTANT_STREAM_ERROR_CODES,
    ...ASSISTANT_REQUEST_ERROR_CODES,
    ...ASSISTANT_CLIENT_ERROR_CODES,
  ])("has English copy for %s", (code) => {
    const key = assistantErrorMessageKey(code);
    expect(key.startsWith("workspace:assistant.errors.")).toBe(true);
    expect(translationExists(key)).toBe(true);
  });
});

describe("failureFromRequestError", () => {
  it("keeps known codes and says which clear up on their own", () => {
    expect(
      failureFromRequestError(
        new HttpError(409, "busy", { code: "ASSISTANT_CHAT_BUSY" }),
      ),
    ).toEqual({ code: "ASSISTANT_CHAT_BUSY", retryable: true });
    expect(
      failureFromRequestError(
        new HttpError(429, "slow down", { code: "ASSISTANT_TOO_MANY_TURNS" }),
      ),
    ).toEqual({ code: "ASSISTANT_TOO_MANY_TURNS", retryable: true });
    expect(
      failureFromRequestError(
        new HttpError(429, "limit", { code: "ASSISTANT_DAILY_LIMIT" }),
      ),
    ).toEqual({ code: "ASSISTANT_DAILY_LIMIT", retryable: false });
    expect(
      failureFromRequestError(
        new HttpError(409, "pending", {
          code: "ASSISTANT_PENDING_APPROVALS",
        }),
      ),
    ).toEqual({ code: "ASSISTANT_PENDING_APPROVALS", retryable: false });
  });

  it("maps other failures without showing the server's text", () => {
    expect(failureFromRequestError(new HttpError(413, "big"))).toEqual({
      code: "MESSAGE_TOO_LONG",
      retryable: false,
    });
    expect(failureFromRequestError(new HttpError(502, "<html>"))).toEqual({
      code: "ASSISTANT_INTERNAL",
      retryable: true,
    });
    expect(
      failureFromRequestError(
        new HttpError(400, "content: too long", { code: "VALIDATION_ERROR" }),
      ),
    ).toEqual({ code: "REQUEST_FAILED", retryable: false });
    expect(failureFromRequestError(new TypeError("offline"))).toEqual({
      code: "NETWORK",
      retryable: true,
    });
  });
});
