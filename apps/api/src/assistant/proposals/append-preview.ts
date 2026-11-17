import { appendMarkdown } from "@kaneo/mcp/tools";

/** How much of the current text an append's diff keeps before the addition. */
export const APPEND_CONTEXT_CHARS = 2_000;

/**
 * The diff of appending `addition` to `current`. An append only changes the
 * end, so a long text keeps just its last lines, starting at a line break:
 * a card shows the addition in context without carrying a whole document.
 */
export function appendPreview(
  current: string,
  addition: string,
): { before: string; after: string } {
  const after = appendMarkdown(current, addition);
  const kept = current.trimEnd();
  if (kept.length <= APPEND_CONTEXT_CHARS) return { before: current, after };
  const lineStart = kept.lastIndexOf(
    "\n",
    kept.length - APPEND_CONTEXT_CHARS - 1,
  );
  const cut = lineStart === -1 ? 0 : lineStart + 1;
  return { before: current.slice(cut), after: after.slice(cut) };
}
