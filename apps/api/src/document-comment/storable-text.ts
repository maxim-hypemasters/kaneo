const UNPAIRED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// PostgreSQL text cannot hold NUL, and jsonb, which carries anchors on a
// document save, also refuses half of a surrogate pair. Either would fail the
// statement, and with it the save.
export function isStorableText(value: string) {
  return !value.includes("\u0000") && !UNPAIRED_SURROGATE.test(value);
}

export const UNSTORABLE_TEXT_MESSAGE =
  "Expected text without NUL characters or unpaired surrogates";
