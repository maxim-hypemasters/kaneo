import { TYPED_BRANCH_PATTERN } from "../../plugins/github/config";

// What integration setup wrote before the typed pattern became the default.
const OLD_DEFAULT_PATTERN = "{slug}-{number}";

// Returns the config with the new default pattern, or null when it is
// unreadable, has a custom regex, or names any pattern but the old default:
// those were chosen on purpose, and a missing one reads as the new default.
export function switchBranchPattern(raw: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const config = value as Record<string, unknown>;
  if (config.customBranchRegex) return null;
  if (config.branchPattern !== OLD_DEFAULT_PATTERN) return null;

  return JSON.stringify({ ...config, branchPattern: TYPED_BRANCH_PATTERN });
}
