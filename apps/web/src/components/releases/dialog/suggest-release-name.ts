import type { Release } from "@/types/release";
import { latestRelease } from "./latest-release";

type NamedRelease = Pick<Release, "name" | "submissionDate">;

const VERSION_NAME =
  /^(v?)(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?$/;

export function suggestReleaseName(releases: readonly NamedRelease[]): string {
  const latest = latestRelease(releases);
  if (!latest) return "";
  const match = VERSION_NAME.exec(latest.name);
  if (!match || match[0] !== latest.name) return "";

  const prefix = match[1];
  const parts = latest.name.slice(prefix.length).split(".");
  const last = parts.length - 1;
  const names = new Set(releases.map(({ name }) => name));
  let next = BigInt(parts[last]);

  // At most one collision per existing name; integer arithmetic also keeps
  // long version components exact instead of rounding at Number.MAX_SAFE_INTEGER.
  while (true) {
    parts[last] = String(++next);
    const name = prefix + parts.join(".");
    if (name.length > 100) return "";
    if (!names.has(name)) return name;
  }
}
