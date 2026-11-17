import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { LIST_STRING_MAX_CHARS } from "../constants";

export const TRUNCATION_NOTE = "…[truncated; call again with offset/limit]";
const ERROR_TEXT_MAX_CHARS = 500;
const ELLIPSIS = "…";

export type CompactToolResult = {
  /** What the model receives. */
  content: string;
  isError: boolean;
  /** A short error for the UI, set only on failed calls. */
  errorText: string | null;
  /** True only when `documentField` reached the model unchanged. */
  bodyComplete: boolean;
  /** The result's JSON before compaction, or undefined when it is not JSON. */
  parsed: unknown;
};

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

/** The first `length` UTF-16 units, without splitting a surrogate pair. */
function prefix(text: string, length: number): string {
  const end = Math.max(0, Math.min(length, text.length));
  return end > 0 &&
    end < text.length &&
    isHighSurrogate(text.charCodeAt(end - 1))
    ? text.slice(0, end - 1)
    : text.slice(0, end);
}

function cut(text: string, max: number, marker: string): string {
  return text.length <= max ? text : prefix(text, max - marker.length) + marker;
}

function resultText(result: CallToolResult): string {
  return result.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const isEmailKey = (key: string) =>
  key.toLowerCase() === "email" ||
  key.endsWith("Email") ||
  key.toLowerCase().endsWith("_email");

// Drops email keys everywhere and cuts strings inside lists. The document
// field sits on the root object, outside any list, and is never touched.
function compactValue(value: unknown, inList: boolean): unknown {
  if (typeof value === "string")
    return inList ? cut(value, LIST_STRING_MAX_CHARS, ELLIPSIS) : value;
  if (Array.isArray(value))
    return value.map((item) => compactValue(item, true));
  if (!isRecord(value)) return value;
  const out: Json = {};
  for (const [key, item] of Object.entries(value))
    if (!isEmailKey(key)) out[key] = compactValue(item, inList);
  return out;
}

function compactRoot(value: unknown, documentField?: string): unknown {
  if (!documentField || !isRecord(value)) return compactValue(value, false);
  const out: Json = {};
  for (const [key, item] of Object.entries(value))
    if (key === documentField) out[key] = item;
    else if (!isEmailKey(key)) out[key] = compactValue(item, false);
  return out;
}

const codePoints = (text: string) => Array.from(text).length;

// Renders the root with its document cut to `length` and the paging fields
// told so. Offsets are counted in code points: tools that count UTF-16 units
// then re-read a few characters rather than skip any.
function renderCutDocument(root: Json, field: string, length: number) {
  const body = prefix(root[field] as string, length);
  const out: Json = { ...root, [field]: body };
  if (typeof root.truncated === "boolean") out.truncated = true;
  if ("nextOffset" in root && typeof root.offset === "number")
    out.nextOffset = root.offset + codePoints(body);
  return JSON.stringify(out);
}

// The longest cut of the document that fits `budget`, or null.
function fitDocument(root: Json, field: string, budget: number): string | null {
  const body = root[field] as string;
  let best: string | null = null;
  let low = 0;
  // An escaped body is never shorter than the raw one.
  let high = Math.min(body.length, budget);
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const text = renderCutDocument(root, field, mid);
    if (text.length <= budget) {
      best = text;
      low = mid + 1;
    } else high = mid - 1;
  }
  return best;
}

function errorTextOf(parsed: unknown, text: string): string {
  const message =
    isRecord(parsed) && typeof parsed.error === "string"
      ? parsed.error
      : isRecord(parsed) && typeof parsed.message === "string"
        ? parsed.message
        : text;
  return cut(
    message.trim() || "The tool failed",
    ERROR_TEXT_MAX_CHARS,
    ELLIPSIS,
  );
}

/**
 * Shrinks a tool result for the model: minified JSON, no email addresses,
 * list strings cut, and an overall cap that ends with TRUNCATION_NOTE. The
 * document field is either kept byte for byte or cut, never rewritten.
 */
export function compactToolResult(
  result: CallToolResult,
  opts: { maxChars: number; documentField?: string },
): CompactToolResult {
  const text = resultText(result);
  const parsed = parseJson(text);
  const isError = result.isError === true;
  const errorText = isError ? errorTextOf(parsed, text) : null;
  const maxChars = Math.max(opts.maxChars, TRUNCATION_NOTE.length);
  const documentField = isError ? undefined : opts.documentField;

  const compacted =
    parsed === undefined ? undefined : compactRoot(parsed, documentField);
  const minified =
    compacted === undefined ? text : (JSON.stringify(compacted) ?? "null");
  const document =
    documentField && isRecord(compacted) ? compacted[documentField] : undefined;
  const hasDocument =
    documentField !== undefined &&
    isRecord(compacted) &&
    Object.hasOwn(compacted, documentField) &&
    (typeof document === "string" || document === null);

  if (minified.length <= maxChars)
    return {
      content: minified || "(empty result)",
      isError,
      errorText,
      bodyComplete: hasDocument,
      parsed,
    };

  const budget = maxChars - TRUNCATION_NOTE.length;
  const fitted =
    documentField !== undefined &&
    typeof document === "string" &&
    isRecord(compacted)
      ? fitDocument(compacted, documentField, budget)
      : null;
  return {
    content: (fitted ?? prefix(minified, budget)) + TRUNCATION_NOTE,
    isError,
    errorText,
    bodyComplete: false,
    parsed,
  };
}
