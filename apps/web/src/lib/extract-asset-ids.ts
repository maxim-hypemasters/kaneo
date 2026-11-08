// The API finds uploads in Markdown with this same pattern, so the client
// claims and prunes exactly the ids the server sees.
const ASSET_URL_PATTERN = /\/api\/asset\/([a-z0-9]+)/gi;

export function extractAssetIds(markdown: string): Set<string> {
  return new Set(
    Array.from(markdown.matchAll(ASSET_URL_PATTERN), (match) => match[1]),
  );
}
