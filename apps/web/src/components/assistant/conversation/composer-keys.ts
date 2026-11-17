export type ComposerKey = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  /** True while an IME is composing; its Enter confirms the composition. */
  isComposing: boolean;
  /** 229 marks keys an IME handles, in browsers that end composition first. */
  keyCode?: number;
  /** The key is held down and repeating. */
  repeat?: boolean;
};

export type ComposerKeyAction = "send" | "hold" | "stop" | "minimize" | null;

/**
 * What a key press in the composer does: Enter sends, Shift+Enter (or
 * Alt+Enter) adds a line, Escape stops a streaming answer and otherwise
 * minimizes the chat. A held Enter sends once ("hold" for the repeats, which
 * neither send nor add lines), so holding it to open the chat from Home's
 * bar doesn't send the draft; a held Escape doesn't go on to minimize the
 * chat it just stopped. Keys that belong to an IME composition do nothing
 * here.
 */
export function composerKeyAction(
  event: ComposerKey,
  { streaming }: { streaming: boolean },
): ComposerKeyAction {
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.key === "Escape") {
    if (event.repeat) return null;
    return streaming ? "stop" : "minimize";
  }
  if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
    return event.repeat ? "hold" : "send";
  }
  return null;
}
