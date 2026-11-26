/**
 * Whether focus can move without pulling it away from what someone is doing:
 * nothing has focus, or focus is already inside `container`.
 */
export function focusIsFree(container: Element | null): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    (container?.contains(active) ?? false)
  );
}
