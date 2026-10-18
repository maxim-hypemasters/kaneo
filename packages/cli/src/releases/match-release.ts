import type { Release } from "../api/releases.js";

export type ReleaseMatch =
  | { readonly kind: "found"; readonly release: Release }
  | {
      readonly kind: "ambiguous";
      readonly candidates: ReadonlyArray<Release>;
    }
  | { readonly kind: "none" };

function normalize(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase();
}

// Names are unique within a project, but only case-sensitively, so "Beta"
// and "beta" can both exist: an exact name wins over a case-insensitive one.
export function matchRelease(
  releases: ReadonlyArray<Release>,
  reference: string,
): ReleaseMatch {
  const trimmed = reference.trim();
  const exact =
    releases.find((release) => release.id === trimmed) ??
    releases.find((release) => release.name === trimmed);
  if (exact) return { kind: "found", release: exact };
  const wanted = normalize(trimmed);
  const named = releases.filter(
    (release) => normalize(release.name) === wanted,
  );
  const [first] = named;
  if (!first) return { kind: "none" };
  if (named.length === 1) return { kind: "found", release: first };
  return { kind: "ambiguous", candidates: named };
}
