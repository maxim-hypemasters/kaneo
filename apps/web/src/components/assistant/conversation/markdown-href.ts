export type MarkdownHref =
  // A Kaneo page the router can open without reloading.
  | { kind: "app"; href: string }
  // Another same-origin path, a fragment or a relative path.
  | { kind: "relative"; href: string }
  // Another site (including protocol-relative `//host`) or an email address.
  | { kind: "external"; href: string };

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
// A base no real link resolves to, so anything that keeps it is relative.
const SENTINEL_ORIGIN = "https://kaneo-relative.invalid";

// What the URL parser ignores: tabs and newlines anywhere, and C0 controls or
// spaces at either end. Removing them first means `java\tscript:` is seen
// for what it is.
const cleanHref = (href: string) =>
  href.replace(/[\t\n\r]/g, "").replace(/^[\0- ]+|[\0- ]+$/g, "");

/**
 * Classifies a link in an assistant answer. Only http, https, mailto and
 * relative links survive; anything else (javascript:, data:, file:…) is
 * null and rendered as plain text. Paths under /dashboard/ and the
 * workspace's /{slug}/task/ permalinks route inside the app.
 */
export function classifyMarkdownHref(
  rawHref: string,
  workspaceSlug?: string,
): MarkdownHref | null {
  const href = cleanHref(rawHref);
  // Backslashes act as slashes in web URLs, so `/\host` is another site.
  if (!href || href.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(href, `${SENTINEL_ORIGIN}/`);
  } catch {
    return null;
  }

  if (url.origin !== SENTINEL_ORIGIN || href.startsWith("//")) {
    return SAFE_PROTOCOLS.has(url.protocol) && !url.username && !url.password
      ? { kind: "external", href }
      : null;
  }

  const path = url.pathname;
  const isApp =
    href.startsWith("/") &&
    (path.startsWith("/dashboard/") ||
      (Boolean(workspaceSlug) &&
        path.startsWith(`/${encodeURIComponent(workspaceSlug ?? "")}/task/`)));
  return { kind: isApp ? "app" : "relative", href };
}

/** react-markdown's urlTransform: keeps only links classifyMarkdownHref allows. */
export function safeMarkdownUrl(url: string): string | null {
  return classifyMarkdownHref(url)?.href ?? null;
}
