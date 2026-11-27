import { type GitHubConfig, TYPED_BRANCH_PATTERN } from "../config";

// A title after "/" is left out with its "/" when it slugs to nothing, so the
// name never ends in a bare "/". After any other separator the separator
// stays, as it always has.
const SLASH_TITLE = "/{title}";
// The title once the pattern is escaped for a RegExp, with the "/" that makes
// it optional.
const ESCAPED_TITLE = /(\/)?\\\{title\\\}/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .replace(/-$/, "");
}

export function generateBranchName(
  pattern: string,
  projectSlug: string,
  taskNumber: number,
  taskTitle: string,
  taskType: string,
): string {
  // slugify keeps only ASCII letters and digits, so a title written in any
  // other script leaves nothing.
  const title = slugify(taskTitle);
  const base = title ? pattern : pattern.replace(SLASH_TITLE, "");
  // Replacer functions insert each value as written, so "$&" in a project key
  // stays text, and the key goes in last so nothing in it reads as a
  // placeholder.
  return base
    .replace("{type}", () => (taskType === "bug" ? "bugfix" : "feature"))
    .replace("{number}", () => taskNumber.toString())
    .replace("{title}", () => title)
    .replace("{slug}", () => projectSlug.toLowerCase());
}

export function createBranchRegex(
  pattern: string,
  projectSlug: string,
): RegExp {
  const regexPattern = escapeRegExp(pattern)
    .replace("\\{type\\}", "(?:feature|bugfix)")
    .replace("\\{number\\}", "(\\d+)")
    // The title can slug to nothing. After a "/", generateBranchName drops it
    // with the "/" and older names kept the "/", so both forms match; any
    // other separator stays required, as it always was.
    .replace(ESCAPED_TITLE, (_title, slash?: string) =>
      slash ? "(?:/([a-z0-9-]*))?" : "([a-z0-9-]*)",
    )
    // Escaped, so a key such as "C++" or "A.B" matches only itself.
    .replace("\\{slug\\}", () => escapeRegExp(projectSlug.toLowerCase()));

  // Allow optional suffix after the pattern (e.g., lif-3-part-1)
  return new RegExp(`^${regexPattern}(?:-.*)?$`, "i");
}

export function extractTaskNumberFromBranch(
  branchName: string,
  config: Pick<GitHubConfig, "branchPattern" | "customBranchRegex">,
  projectSlug: string,
): number | null {
  if (config.customBranchRegex) {
    try {
      const customRegex = new RegExp(config.customBranchRegex, "i");
      const match = branchName.match(customRegex);
      if (match?.[1]) {
        const num = Number.parseInt(match[1], 10);
        if (!Number.isNaN(num)) return num;
      }
    } catch {
      console.error("Invalid custom branch regex:", config.customBranchRegex);
    }
    return null;
  }

  const pattern = config.branchPattern || TYPED_BRANCH_PATTERN;
  const regex = createBranchRegex(pattern, projectSlug);
  const match = branchName.match(regex);

  if (match?.[1]) {
    const num = Number.parseInt(match[1], 10);
    if (!Number.isNaN(num)) return num;
  }

  return null;
}

const URL_PATTERN = /\bhttps?:\/\/\S+/gi;

function withShortLinksAsTickets(text: string) {
  return text.replace(URL_PATTERN, (url) => {
    const ticket = url.match(
      /\/task\/([^/?#\s]+-\d+)(?![\p{L}\p{N}\p{M}_~-])/u,
    )?.[1];
    return ticket ? ` ${ticket} ` : url;
  });
}

function extractExplicitTaskNumber(
  text: string,
  projectSlug?: string,
): number | null {
  if (projectSlug) {
    const slug = escapeRegExp(projectSlug);
    const key = withShortLinksAsTickets(text).match(
      new RegExp(`(?:^|[^\\w-])${slug}-(\\d+)(?=$|[^\\w])`, "i"),
    );
    if (key?.[1]) return Number.parseInt(key[1], 10);
  }

  const task = text
    .replace(URL_PATTERN, "<link>")
    .match(/\btask[:\-\s#]+(\d+)\b/i);
  return task?.[1] ? Number.parseInt(task[1], 10) : null;
}

export function extractTaskNumberFromPRTitle(
  title: string,
  projectSlug?: string,
): number | null {
  return extractExplicitTaskNumber(title, projectSlug);
}

export function extractTaskNumberFromPRBody(
  body: string,
  projectSlug?: string,
): number | null {
  return extractExplicitTaskNumber(body, projectSlug);
}

export function extractTaskNumber(
  branchName: string,
  prTitle: string | undefined,
  prBody: string | undefined,
  config: Pick<GitHubConfig, "branchPattern" | "customBranchRegex">,
  projectSlug: string,
): number | null {
  const fromBranch = extractTaskNumberFromBranch(
    branchName,
    config,
    projectSlug,
  );
  if (fromBranch !== null) return fromBranch;

  if (prTitle) {
    const fromTitle = extractTaskNumberFromPRTitle(prTitle, projectSlug);
    if (fromTitle !== null) return fromTitle;
  }

  if (prBody) {
    const fromBody = extractTaskNumberFromPRBody(prBody, projectSlug);
    if (fromBody !== null) return fromBody;
  }

  return null;
}
