const storageKey = (workspaceId: string) =>
  `kaneo:home-assistant-minimized:${workspaceId}`;

/**
 * Whether the person minimized Home's assistant in this tab and hasn't opened
 * it since, so coming back to a link to a chat (Back, a reload) keeps it
 * minimized instead of opening it over the rest of Home.
 */
export function readMinimized(workspaceId: string): boolean {
  try {
    return sessionStorage.getItem(storageKey(workspaceId)) === "1";
  } catch {
    // Storage blocked: open on a link to a chat, as without a flag.
    return false;
  }
}

export function writeMinimized(workspaceId: string, minimized: boolean) {
  try {
    if (minimized) sessionStorage.setItem(storageKey(workspaceId), "1");
    else sessionStorage.removeItem(storageKey(workspaceId));
  } catch {
    // Storage blocked: Home forgets the choice on its next visit.
  }
}
