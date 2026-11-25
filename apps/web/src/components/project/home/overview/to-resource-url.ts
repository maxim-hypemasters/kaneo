import { normalizeUrl } from "@/lib/editor-url-utils";
import { getExternalWebUrl } from "@/lib/external-url";

const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const WEB_SCHEME = /^https?:\/\//i;

// What someone typed, as a web address a link can safely open, or null. An
// address typed without a scheme gets https://, but only when it looks like a
// site: "figma.com/file" passes, a stray word does not.
export function toResourceUrl(input: string) {
  const typed = input.trim();
  const hasWebScheme = WEB_SCHEME.test(typed);
  if (!hasWebScheme && SCHEME.test(typed) && !/^[^/:]+:\d/.test(typed))
    return null;

  const normalized = normalizeUrl(typed);
  const url = normalized ? getExternalWebUrl(normalized) : null;
  if (!url) return null;
  if (hasWebScheme) return url;

  const { hostname } = new URL(url);
  return hostname.includes(".") || hostname === "localhost" ? url : null;
}
