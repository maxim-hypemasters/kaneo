// Search matches activity on its stored text, so a row can be found through
// a name redaction then hides. Rescores such a row against what the viewer
// gets: still a text match, a match on the task's title alone (score 1), or
// no match, which is null and drops the row. Like the query, content wins
// over event data when both are set.
export function redactedActivityScore(
  row: { content: string | null; eventData: unknown; taskTitle: string | null },
  query: string,
  score: number,
): number | null {
  if (row.content !== null) return score;
  const needle = query.toLowerCase();
  if ((JSON.stringify(row.eventData) ?? "").toLowerCase().includes(needle)) {
    return score;
  }
  return row.taskTitle?.toLowerCase().includes(needle) ? 1 : null;
}
