export const CHAT_TITLE_MAX_CHARS = 80;

// Line breaks, tabs and other control characters all become single spaces.
const SPACING = /[\s\p{Cc}]+/gu;

/**
 * A chat's title from its first message: one line of at most 80 UTF-16 code
 * units, ending in an ellipsis when cut. A cut never splits a character.
 */
export function chatTitleFromMessage(content: string): string {
  const line = content.replace(SPACING, " ").trim();
  if (line.length <= CHAT_TITLE_MAX_CHARS) return line;

  let title = "";
  for (const char of line) {
    if (title.length + char.length > CHAT_TITLE_MAX_CHARS - 1) break;
    title += char;
  }
  return `${title.trimEnd()}…`;
}
