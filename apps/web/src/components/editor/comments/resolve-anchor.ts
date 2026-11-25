import type { CommentAnchor, CommentRange } from "./comment-anchor";
import type { DocumentTextProjection } from "./document-text";
import { normalizeText } from "./normalize-text";

// A lone short word is too common to trust on a chance match of one or two
// characters beside it, so it needs this much of its context to still be there
// (or all of it, when less was captured).
const SHORT_QUOTE_LENGTH = 12;
const SHORT_QUOTE_CONTEXT = 3;
const MIN_FALLBACK_CONTEXT = 8;
const FALLBACK_SLACK = 64;

// How much of `context` the text right before `end` finishes with. The
// contexts were trimmed when captured, so one space at the join is skipped.
function matchBefore(text: string, end: number, context: string) {
  const edge = text[end - 1] === " " ? end - 1 : end;
  let length = 0;
  while (
    length < context.length &&
    length < edge &&
    text[edge - 1 - length] === context[context.length - 1 - length]
  )
    length += 1;
  return length;
}

function matchAfter(text: string, start: number, context: string) {
  const edge = text[start] === " " ? start + 1 : start;
  let length = 0;
  while (
    length < context.length &&
    edge + length < text.length &&
    text[edge + length] === context[length]
  )
    length += 1;
  return length;
}

// When the quote itself is gone (reworded), the text now standing between its
// old neighbours is taken instead, as long as it is of a believable length.
function findBetweenContexts(
  text: string,
  quote: string,
  prefix: string,
  suffix: string,
) {
  if (
    prefix.length < MIN_FALLBACK_CONTEXT ||
    suffix.length < MIN_FALLBACK_CONTEXT
  )
    return null;
  const longest = Math.max(2 * quote.length, quote.length + FALLBACK_SLACK);
  let best: { start: number; end: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (
    let hit = text.indexOf(prefix);
    hit !== -1;
    hit = text.indexOf(prefix, hit + 1)
  ) {
    let start = hit + prefix.length;
    let end = text.indexOf(suffix, start);
    if (end === -1) break;
    if (text[start] === " ") start += 1;
    if (end > start && text[end - 1] === " ") end -= 1;
    const length = end - start;
    if (length < 1 || length > longest) continue;
    const distance = Math.abs(length - quote.length);
    if (distance < bestDistance) {
      best = { start, end };
      bestDistance = distance;
    }
  }
  return best;
}

// Where an anchor's text is in the document now, or null when it cannot be
// found with confidence (the thread is then shown as detached).
export function resolveAnchor(
  projection: DocumentTextProjection,
  anchor: CommentAnchor,
): CommentRange | null {
  const { text, starts, ends } = projection;
  const quote = normalizeText(anchor.quote);
  if (!quote) return null;
  const prefix = normalizeText(anchor.prefix);
  const suffix = normalizeText(anchor.suffix);
  const range = (start: number, end: number) => ({
    from: starts[start],
    to: ends[end - 1],
  });

  let count = 0;
  let best = -1;
  let bestScore = -1;
  for (
    let at = text.indexOf(quote);
    at !== -1;
    at = text.indexOf(quote, at + 1)
  ) {
    count += 1;
    const score =
      matchBefore(text, at, prefix) +
      matchAfter(text, at + quote.length, suffix);
    if (score > bestScore) {
      best = at;
      bestScore = score;
    }
  }

  if (count === 0) {
    const between = findBetweenContexts(text, quote, prefix, suffix);
    return between && range(between.start, between.end);
  }
  // Several occurrences and nothing to tell them apart.
  if (count > 1 && bestScore === 0) return null;
  // An anchor captured with no text around it asks for none, so its only
  // occurrence is accepted.
  const needed =
    quote.length < SHORT_QUOTE_LENGTH
      ? Math.min(SHORT_QUOTE_CONTEXT, prefix.length + suffix.length)
      : 0;
  if (bestScore < needed) return null;
  return range(best, best + quote.length);
}
