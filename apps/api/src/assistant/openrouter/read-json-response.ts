import { OpenRouterError } from "./openrouter-error";

/**
 * Reads a JSON body of at most `maxBytes`. An oversized, unreadable or
 * malformed body is an OPENROUTER_UNREACHABLE error, as OpenRouter gave no
 * usable answer.
 */
export async function readJsonResponse(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new OpenRouterError("OPENROUTER_UNREACHABLE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new OpenRouterError("OPENROUTER_UNREACHABLE");
      chunks.push(value);
    }
  } catch {
    throw new OpenRouterError("OPENROUTER_UNREACHABLE");
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new OpenRouterError("OPENROUTER_UNREACHABLE");
  }
}
