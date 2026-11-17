import { diffLines } from "diff";

export type DiffLineKind = "added" | "removed" | "unchanged";

export type DiffRow = {
  /** Unique in the diff: where the row starts in the before and after. */
  key: string;
} & (
  | { kind: DiffLineKind; text: string }
  // Unchanged lines away from any change, folded into one row.
  | { kind: "skipped"; count: number }
);

/** Unchanged lines kept on each side of a change. */
export const DIFF_CONTEXT_LINES = 3;

function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/**
 * A line diff of a text's before and after, as a reader scans it: added and
 * removed lines with a few unchanged lines around them, and every longer
 * stretch of unchanged lines folded into a count.
 */
export function buildDiffRows(
  before: string,
  after: string,
  context = DIFF_CONTEXT_LINES,
): DiffRow[] {
  // A last line that only gains a line break (as text appended after it
  // does) is the same line to a reader.
  const changes = diffLines(before, after, { ignoreNewlineAtEof: true });
  let beforeLine = 0;
  let afterLine = 0;
  const lines = changes.flatMap((change) => {
    const kind: DiffLineKind = change.added
      ? "added"
      : change.removed
        ? "removed"
        : "unchanged";
    return splitLines(change.value).map((text) => {
      const key = `${beforeLine}:${afterLine}`;
      if (kind !== "added") beforeLine += 1;
      if (kind !== "removed") afterLine += 1;
      return { key, kind, text };
    });
  });

  const nearChange = lines.map(() => false);
  lines.forEach((line, index) => {
    if (line.kind === "unchanged") return;
    const from = Math.max(0, index - context);
    const to = Math.min(lines.length - 1, index + context);
    for (let near = from; near <= to; near++) nearChange[near] = true;
  });

  const rows: DiffRow[] = [];
  let folded: DiffRow[] = [];
  const flush = () => {
    const [first] = folded;
    // Folding a single line would take as much room as showing it.
    if (folded.length === 1) rows.push(...folded);
    else if (first)
      rows.push({ key: first.key, kind: "skipped", count: folded.length });
    folded = [];
  };
  lines.forEach((line, index) => {
    if (line.kind === "unchanged" && !nearChange[index]) {
      folded.push(line);
      return;
    }
    flush();
    rows.push(line);
  });
  flush();
  return rows;
}

/** Whether the rows change anything. */
export const hasChanges = (rows: readonly Pick<DiffRow, "kind">[]) =>
  rows.some((row) => row.kind === "added" || row.kind === "removed");
