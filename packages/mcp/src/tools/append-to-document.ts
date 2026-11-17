/** Appends Markdown as a new block after the existing body. */
export function appendMarkdown(existing: string, addition: string): string {
  const text = addition.trim();
  if (!text) return existing;
  if (!existing.trim()) return text;
  return `${existing.trimEnd()}\n\n${text}`;
}
