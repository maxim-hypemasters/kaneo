import { commentExcerpt } from "../../activity/comment-excerpt";

const MENTION =
  /<kaneo-mention\b[^>]*?\blabel="([^"]*)"[^>]*>(?:\s*<\/kaneo-mention>)?/gi;
// Bold, strikethrough and code marks. Single * and _ are left alone: they are
// as likely to be part of the text.
const EMPHASIS = /\*\*|~~|`/g;

// A short plain-text preview of a comment. A mention is an empty tag whose
// name is in an attribute, so it is written out as @name before the markup is
// stripped; otherwise "Thanks @Ana" would read "Thanks".
export function documentCommentPreview(content: string): string | null {
  return commentExcerpt(
    content
      .replace(MENTION, (_tag, label: string) => (label ? `@${label}` : " "))
      .replace(EMPHASIS, ""),
  );
}
