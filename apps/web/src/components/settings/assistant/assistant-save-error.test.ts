import { describe, expect, it } from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import { getAssistantSaveError } from "./assistant-save-error";

describe("getAssistantSaveError", () => {
  it("puts key errors on the key field", () => {
    expect(
      getAssistantSaveError(
        new HttpError(400, "rejected", { code: "OPENROUTER_KEY_INVALID" }),
      ),
    ).toEqual({
      field: "apiKey",
      messageKey: "settings:assistantPage.errors.keyInvalid",
    });
    expect(
      getAssistantSaveError(
        new HttpError(400, "required", { code: "OPENROUTER_KEY_REQUIRED" }),
      ),
    ).toEqual({
      field: "apiKey",
      messageKey: "settings:assistantPage.errors.keyRequired",
    });
  });

  it("puts an unsupported model on the model field", () => {
    expect(
      getAssistantSaveError(
        new HttpError(400, "model", { code: "ASSISTANT_MODEL_UNSUPPORTED" }),
      ),
    ).toEqual({
      field: "model",
      messageKey: "settings:assistantPage.errors.modelUnsupported",
    });
  });

  it("reports an unreachable OpenRouter for the whole form", () => {
    expect(
      getAssistantSaveError(
        new HttpError(502, "down", { code: "OPENROUTER_UNREACHABLE" }),
      ),
    ).toEqual({
      field: "form",
      messageKey: "settings:assistantPage.errors.unreachable",
    });
  });

  it("maps validation issues to their field", () => {
    expect(
      getAssistantSaveError(
        new HttpError(400, "apiKey: too short", {
          code: "VALIDATION_ERROR",
          issues: [{ path: "body.apiKey", message: "too short" }],
        }),
      ),
    ).toEqual({
      field: "apiKey",
      messageKey: "settings:assistantPage.errors.keyFormat",
    });
    expect(
      getAssistantSaveError(
        new HttpError(400, "model: too long", {
          code: "VALIDATION_ERROR",
          issues: [{ path: "body.model", message: "too long" }],
        }),
      ),
    ).toEqual({
      field: "model",
      messageKey: "settings:assistantPage.errors.modelFormat",
    });
  });

  it("falls back to a generic message and never shows server text", () => {
    const fallback = {
      field: "form",
      messageKey: "settings:assistantPage.errors.saveFailed",
    };
    expect(getAssistantSaveError(new HttpError(500, "boom"))).toEqual(fallback);
    expect(getAssistantSaveError(new Error("network"))).toEqual(fallback);
    expect(getAssistantSaveError(null)).toEqual(fallback);
  });
});
