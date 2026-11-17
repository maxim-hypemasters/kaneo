export type AssistantSaveErrorField = "apiKey" | "model" | "form";

export type AssistantSaveError = {
  field: AssistantSaveErrorField;
  messageKey: string;
};

const BY_CODE: Record<string, AssistantSaveError> = {
  OPENROUTER_KEY_INVALID: {
    field: "apiKey",
    messageKey: "settings:assistantPage.errors.keyInvalid",
  },
  OPENROUTER_KEY_REQUIRED: {
    field: "apiKey",
    messageKey: "settings:assistantPage.errors.keyRequired",
  },
  ASSISTANT_MODEL_UNSUPPORTED: {
    field: "model",
    messageKey: "settings:assistantPage.errors.modelUnsupported",
  },
  OPENROUTER_UNREACHABLE: {
    field: "form",
    messageKey: "settings:assistantPage.errors.unreachable",
  },
};

const BY_ISSUE_PATH: Record<string, AssistantSaveError> = {
  "body.apiKey": {
    field: "apiKey",
    messageKey: "settings:assistantPage.errors.keyFormat",
  },
  "body.model": {
    field: "model",
    messageKey: "settings:assistantPage.errors.modelFormat",
  },
};

const FALLBACK: AssistantSaveError = {
  field: "form",
  messageKey: "settings:assistantPage.errors.saveFailed",
};

function readDetails(error: unknown) {
  if (typeof error !== "object" || error === null) return {};
  const { code, issues } = error as { code?: unknown; issues?: unknown };
  return {
    code: typeof code === "string" ? code : undefined,
    paths: Array.isArray(issues)
      ? issues.flatMap((issue: { path?: unknown }) =>
          typeof issue?.path === "string" ? [issue.path] : [],
        )
      : [],
  };
}

// Maps a failed save to a static message and the field it belongs to. The
// server's text is never shown, so every message stays translatable.
export function getAssistantSaveError(error: unknown): AssistantSaveError {
  const { code, paths = [] } = readDetails(error);
  if (code && BY_CODE[code]) return BY_CODE[code];
  for (const path of paths) {
    if (BY_ISSUE_PATH[path]) return BY_ISSUE_PATH[path];
  }
  return FALLBACK;
}
