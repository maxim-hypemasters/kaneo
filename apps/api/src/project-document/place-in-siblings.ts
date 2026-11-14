// Returns the sibling order after moving `id` to `index`. The index counts the
// siblings without the moved page and is clamped to the end.
export function placeInSiblings(
  siblingIds: readonly string[],
  id: string,
  index: number,
): string[] {
  const others = siblingIds.filter((siblingId) => siblingId !== id);
  const at = Math.max(0, Math.min(index, others.length));
  return [...others.slice(0, at), id, ...others.slice(at)];
}
