import {
  type CommentAnchor,
  type CommentRange,
  CONTEXT_LENGTH,
  MAX_QUOTE_LENGTH,
} from "./comment-anchor";
import type { DocumentTextProjection } from "./document-text";

function firstIndex(values: number[], accept: (value: number) => boolean) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (accept(values[middle])) high = middle;
    else low = middle + 1;
  }
  return low;
}

// A lone surrogate is stored as U+FFFD and never compares equal again, so no
// slice may end between the two halves of a pair.
function splitsPair(text: string, index: number) {
  if (index <= 0 || index >= text.length) return false;
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return (
    before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
  );
}

// Where a quote that is too long ends instead: after the last whole word that
// fits, and never inside a mention or issue link, whose text cannot be
// highlighted in part.
function clampEnd(
  { text, starts, ends }: DocumentTextProjection,
  start: number,
  limit: number,
) {
  const sameSource = (index: number) =>
    starts[index - 1] === starts[index] && ends[index - 1] === ends[index];
  for (let index = limit; index > start; index -= 1) {
    if (text[index] === " " && !sameSource(index)) return index;
  }
  let end = limit;
  while (end > start && (sameSource(end) || splitsPair(text, end))) end -= 1;
  return end;
}

// The anchor for the text in the ProseMirror range `[from, to)`, or null when
// the range holds no text (an image on its own, say). `range` is what was
// actually anchored, which is narrower than the request after trimming or
// when the quote had to be shortened.
export function captureAnchor(
  projection: DocumentTextProjection,
  from: number,
  to: number,
): { anchor: CommentAnchor; range: CommentRange; truncated: boolean } | null {
  const { text, starts, ends } = projection;
  let start = firstIndex(ends, (end) => end > from);
  let end = firstIndex(starts, (value) => value >= to);
  while (start < end && text[start] === " ") start += 1;
  while (end > start && text[end - 1] === " ") end -= 1;
  if (start >= end) return null;
  if (splitsPair(text, start)) start -= 1;
  if (splitsPair(text, end)) end += 1;

  const truncated = end - start > MAX_QUOTE_LENGTH;
  if (truncated) {
    end = clampEnd(projection, start, start + MAX_QUOTE_LENGTH);
    if (end <= start) return null;
  }

  let prefixStart = Math.max(0, start - CONTEXT_LENGTH);
  if (splitsPair(text, prefixStart)) prefixStart += 1;
  let suffixEnd = Math.min(text.length, end + CONTEXT_LENGTH);
  if (splitsPair(text, suffixEnd)) suffixEnd -= 1;

  return {
    anchor: {
      quote: text.slice(start, end),
      prefix: text.slice(prefixStart, start).trim(),
      suffix: text.slice(end, suffixEnd).trim(),
    },
    range: { from: starts[start], to: ends[end - 1] },
    truncated,
  };
}
