export type ComposerKey = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  /** True while an IME is composing; its Enter confirms the composition. */
  isComposing: boolean;
  /** 229 marks keys an IME handles, in browsers that end composition first. */
  keyCode?: number;
};

export type ComposerKeyAction = "send" | "stop" | null;

/**
 * What a key press in the composer does: Enter sends, Shift+Enter (or
 * Alt+Enter) adds a line, Escape stops a streaming answer. Keys that belong
 * to an IME composition do nothing here.
 */
export function composerKeyAction(
  event: ComposerKey,
  { streaming }: { streaming: boolean },
): ComposerKeyAction {
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.key === "Escape") return streaming ? "stop" : null;
  if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
    return "send";
  }
  return null;
}
