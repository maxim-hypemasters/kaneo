const LINE_MARKERS =
  /^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)+/;
const FENCE = /^\s*(?:```|~~~)/;
const RULE = /^\s*(?:[-*_]\s*){3,}$/;
const TABLE_RULE = /^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-*:?\s*\|?\s*$/;

// The description is Markdown; a one-line header shows its first line of
// prose as plain text.
export function descriptionExcerpt(markdown: string | null | undefined) {
  if (!markdown) return "";
  let fenced = false;
  for (const raw of markdown.split(/\r?\n/)) {
    if (FENCE.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || RULE.test(raw) || TABLE_RULE.test(raw)) continue;
    const text = raw
      .replace(LINE_MARKERS, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(
        /<kaneo-mention[^>]*\blabel="([^"]*)"[^>]*>\s*<\/kaneo-mention>/g,
        "@$1",
      )
      .replace(/<[^>]+>/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
      .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?=[^\w*]|$)/g, "$1$2")
      .replace(/&nbsp;/g, " ")
      .replace(/^\||\|$/g, "")
      .replace(/\s*\|\s*/g, " · ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text;
  }
  return "";
}
