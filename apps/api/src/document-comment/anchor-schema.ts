import { z } from "../openapi";
import { isStorableText, UNSTORABLE_TEXT_MESSAGE } from "./storable-text";

// Stored exactly as sent: trimming would stop the quote from matching the
// document text it was taken from.
export const commentAnchorSchema = z
  .object({
    quote: z
      .string()
      .min(1)
      .max(2_000)
      .refine(isStorableText, UNSTORABLE_TEXT_MESSAGE)
      .openapi({
        description:
          "The commented text as the reader sees it, without Markdown syntax. Up to 2,000 characters, kept exactly as sent.",
      }),
    prefix: z
      .string()
      .max(200)
      .refine(isStorableText, UNSTORABLE_TEXT_MESSAGE)
      .openapi({
        description:
          "The text just before the quote, to tell repeated phrases apart. May be empty.",
      }),
    suffix: z
      .string()
      .max(200)
      .refine(isStorableText, UNSTORABLE_TEXT_MESSAGE)
      .openapi({
        description: "The text just after the quote. May be empty.",
      }),
  })
  .strict();

export const commentAnchorUpdates = z
  .array(commentAnchorSchema.extend({ id: z.string().min(1) }).strict())
  .max(200);
