// The requested links first, sorted by the positions asked for. Links the
// request leaves out, such as one a teammate added a moment ago, follow in
// the order they already have.
export function applyLinkOrder(
  currentIds: string[],
  requested: Array<{ id: string; position: number }>,
) {
  const requestedIds = [...requested]
    .sort((a, b) => a.position - b.position)
    .map((link) => link.id);
  const listed = new Set(requestedIds);
  return [...requestedIds, ...currentIds.filter((id) => !listed.has(id))];
}
