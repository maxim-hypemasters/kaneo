// Beyond this a card shows text folded, with Show all.
export const LONG_TEXT_LINES = 8;
export const LONG_TEXT_CHARS = 600;

/** Whether text would make a card too tall to scan without folding it. */
export function isLongText(value: string): boolean {
  return (
    value.length > LONG_TEXT_CHARS || value.split("\n").length > LONG_TEXT_LINES
  );
}
