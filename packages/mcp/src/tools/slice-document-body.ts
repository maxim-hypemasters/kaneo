export type DocumentBodySlice = {
  body: string;
  offset: number;
  totalLength: number;
  /** True when `body` is not the whole document, whether text was cut before or after it. */
  truncated: boolean;
  nextOffset: number | null;
};

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** Returns one page of a document body, counted in UTF-16 code units, without splitting a surrogate pair. */
export function sliceDocumentBody(
  body: string,
  offset = 0,
  maxChars = 12_000,
): DocumentBodySlice {
  const totalLength = body.length;
  const size = Math.max(1, Math.trunc(maxChars) || 1);
  let start = Math.min(Math.max(0, Math.trunc(offset) || 0), totalLength);
  if (
    start > 0 &&
    start < totalLength &&
    isLowSurrogate(body.charCodeAt(start)) &&
    isHighSurrogate(body.charCodeAt(start - 1))
  )
    start -= 1;
  let end = Math.min(start + size, totalLength);
  if (
    end > start &&
    end < totalLength &&
    isHighSurrogate(body.charCodeAt(end - 1)) &&
    isLowSurrogate(body.charCodeAt(end))
  )
    // A page of one code unit cannot hold the pair, so it takes the whole pair.
    end = end - 1 > start ? end - 1 : end + 1;
  return {
    body: body.slice(start, end),
    offset: start,
    totalLength,
    truncated: start > 0 || end < totalLength,
    nextOffset: end < totalLength ? end : null,
  };
}
