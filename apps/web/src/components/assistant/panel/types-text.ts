export type BarKey = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** AltGr, which types characters on many keyboards and reports Ctrl+Alt. */
  altGraph: boolean;
  /** On a Mac, Option types characters; elsewhere Alt makes shortcuts. */
  mac: boolean;
  /** True while an IME is composing. */
  isComposing: boolean;
  /** 229 marks keys an IME handles. */
  keyCode?: number;
};

/**
 * Whether a key press on Home's assistant bar types text, so the bar opens
 * the chat and the browser types the key into the composer. Characters made
 * with Shift, AltGr or (on a Mac) Option count, and so does a dead key, which
 * starts an accented letter. Space is left to the button, which opens the
 * chat; shortcuts and keys without a character type nothing.
 *
 * An IME doesn't compose on a button, so its first key would arrive as a
 * plain letter: people typing with one open the bar with a click or Enter
 * first.
 */
export function typesText(event: BarKey): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  if (event.metaKey) return false;
  if (event.ctrlKey && !event.altGraph) return false;
  if (event.altKey && !event.altGraph && !event.mac) return false;
  if (event.key === "Dead") return true;
  // Named keys ("Enter", "Shift", "Tab") are words; a character is one code
  // point, which may take two UTF-16 units.
  if (Array.from(event.key).length !== 1) return false;
  return event.key.trim() !== "";
}
