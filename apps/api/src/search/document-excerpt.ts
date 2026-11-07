const EXCERPT_LENGTH = 160;
const LEAD = 40;

// Document bodies are Markdown; search shows them as one line of plain text
// around the first match, so a long page never fills the results.
export function documentExcerpt(body: string, query: string) {
  const text = body
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  const match = text.toLowerCase().indexOf(query.toLowerCase());
  const start = match > LEAD ? match - LEAD : 0;
  const excerpt = text.slice(start, start + EXCERPT_LENGTH).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${start + EXCERPT_LENGTH < text.length ? "…" : ""}`;
}
