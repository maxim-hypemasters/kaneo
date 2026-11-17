import { pagingNumber, z } from "../openapi";
import { decodeChatCursor } from "./chats/chat-cursor";
import { MAX_USER_MESSAGE_CHARS } from "./constants";

export const workspaceIdParam = z.object({ workspaceId: z.string() });

export const chatIdParam = z.object({
  workspaceId: z.string(),
  chatId: z.string(),
});

export const updateAssistantSettingsBody = z
  .object({
    apiKey: z
      .string()
      .trim()
      .max(256)
      .regex(
        /^(?:|[\x20-\x7E]{20,256})$/,
        "Expected an OpenRouter key of 20 to 256 printable ASCII characters",
      )
      .optional()
      .openapi({
        description:
          "A new OpenRouter API key, checked with OpenRouter before it is saved. Omit it, or send it blank, to keep the saved key. Required when no readable key is saved.",
      }),
    model: z.string().trim().min(1).max(200).openapi({
      description:
        "An OpenRouter model id (or its canonical slug) that supports tool calls through chat completions.",
      example: "anthropic/claude-sonnet-5.5",
    }),
    allowDataCollection: z.boolean().optional().openapi({
      description:
        "Allow providers that may collect or train on prompts. Omit to keep the saved choice; new settings default to false.",
    }),
  })
  .strict();

export type UpdateAssistantSettingsInput = z.infer<
  typeof updateAssistantSettingsBody
>;

export const listAssistantChatsQuery = z.object({
  limit: pagingNumber(1, 50, 30),
  before: z
    .string()
    .max(512)
    .refine((value) => decodeChatCursor(value) !== null, "Invalid cursor")
    .optional()
    .openapi({
      description:
        "The `nextCursor` of the previous page, to list the chats after it.",
    }),
});

const timeZone = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_+:/-]+$/, "Expected an IANA time zone")
  .optional()
  .openapi({
    description:
      "The browser's IANA time zone, used for dates and times in answers. A zone the server doesn't know falls back to UTC.",
    example: "Europe/Berlin",
  });

export const assistantMessageBody = z
  .object({
    content: z
      .string()
      .trim()
      .min(1)
      .max(MAX_USER_MESSAGE_CHARS)
      // PostgreSQL text can't store NUL, so the insert would fail mid-turn.
      .refine(
        (value) => !value.includes("\u0000"),
        "Expected text without NUL characters",
      )
      .openapi({
        description:
          "The message, up to 8,000 characters. NUL characters are refused.",
      }),
    timeZone,
  })
  .strict();

export const assistantContinueBody = z.object({ timeZone }).strict();

export type ListAssistantChatsQuery = z.infer<typeof listAssistantChatsQuery>;
export type AssistantMessageInput = z.infer<typeof assistantMessageBody>;
export type AssistantContinueInput = z.infer<typeof assistantContinueBody>;
