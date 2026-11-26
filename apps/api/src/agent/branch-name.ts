import { branchPatterns } from "../plugins/github/config";
import { generateBranchName } from "../plugins/github/utils/branch-matcher";

const DEFAULT_PATTERN = "{slug}-{number}";

/**
 * The branch a Ship run pushes. It follows the project's GitHub branch
 * pattern, so the GitHub integration links the pull request to the task.
 * A custom regex can't generate a name, so it falls back to the default.
 */
export function agentBranchName(input: {
  pattern: string | undefined;
  projectSlug: string;
  taskNumber: number;
  taskTitle: string;
}): string {
  const pattern =
    input.pattern &&
    (branchPatterns as readonly string[]).includes(input.pattern)
      ? input.pattern
      : DEFAULT_PATTERN;
  return generateBranchName(
    pattern,
    input.projectSlug,
    input.taskNumber,
    input.taskTitle,
  );
}
