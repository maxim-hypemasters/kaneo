import { z } from "../../openapi";
import { MAX_DECISIONS } from "../constants";

const decision = z
  .object({
    messageId: z.string().min(1).max(64).openapi({
      description: "A tool message of the chat that waits for approval.",
    }),
    approve: z.boolean().openapi({
      description: "True runs the change as the caller; false rejects it.",
    }),
  })
  .strict();

export const assistantDecisionsBody = z
  .object({
    decisions: z
      .array(decision)
      .min(1)
      .max(MAX_DECISIONS)
      .refine(
        (items) =>
          new Set(items.map((item) => item.messageId)).size === items.length,
        "Decide each message once",
      )
      .openapi({
        description: `Up to ${MAX_DECISIONS} decisions. Approved changes run in the order they were proposed.`,
      }),
  })
  .strict();

export type AssistantDecisionsInput = z.infer<typeof assistantDecisionsBody>;
