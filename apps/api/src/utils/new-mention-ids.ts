import { parseMentionIds } from "./parse-mentions";

type Texts = string | null | undefined | readonly (string | null | undefined)[];

const mentionsIn = (texts: Texts) =>
  (typeof texts === "string" || texts == null ? [texts] : texts).flatMap(
    (text) => parseMentionIds(text),
  );

// People mentioned in `after` who were not mentioned in `before`, leaving out
// the author. A text saved again, or a mention moved between a record's
// fields, notifies no one twice.
export function newMentionIds(
  before: Texts,
  after: Texts,
  authorId: string | null | undefined,
): string[] {
  const known = new Set(mentionsIn(before));
  return [...new Set(mentionsIn(after))].filter(
    (id) => id !== authorId && !known.has(id),
  );
}
