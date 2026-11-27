const DEFAULT_PATTERN = "{type}/{slug}-{number}/{title}";
// The old default; projects that keep it still copy a name with the title.
const LEGACY_DEFAULT_PATTERN = "{slug}-{number}";

function slugify(text: string | undefined) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .replace(/-$/, "");
}

function branchType(taskType: string | null | undefined) {
  return taskType === "bug" ? "bugfix" : "feature";
}

export function generateBranchName(
  pattern: string | null | undefined,
  projectSlug: string | undefined,
  taskNumber: number | null | undefined,
  taskTitle: string | undefined,
  taskType: string | null | undefined,
) {
  if (!projectSlug || !taskNumber) return "";
  const base =
    pattern === LEGACY_DEFAULT_PATTERN
      ? `${LEGACY_DEFAULT_PATTERN}-{title}`
      : pattern || DEFAULT_PATTERN;
  const title = slugify(taskTitle);
  // A title with no ASCII letters or digits slugs to nothing. After "/" it is
  // left out with the "/", so the name never ends in "/"; any other separator
  // stays, as it always has.
  const named = title ? base : base.replace("/{title}", "");
  // Replacer functions insert each value as written, so "$&" in a project key
  // stays text, and the key goes in last so nothing in it reads as a
  // placeholder.
  return named
    .replace("{type}", () => branchType(taskType))
    .replace("{number}", () => taskNumber.toString())
    .replace("{title}", () => title)
    .replace("{slug}", () => projectSlug.toLowerCase());
}
