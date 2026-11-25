const WHITESPACE = /\s/;
const WHITESPACE_RUNS = /\s+/g;

export function isWhitespace(unit: string) {
  return WHITESPACE.test(unit);
}

// The shape of text in a document projection: single spaces, none at the edges.
export function normalizeText(value: string) {
  return value.replace(WHITESPACE_RUNS, " ").trim();
}
