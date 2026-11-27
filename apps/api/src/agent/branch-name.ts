import { branchPatterns, TYPED_BRANCH_PATTERN } from "../plugins/github/config";
import {
  extractTaskNumberFromBranch,
  generateBranchName,
} from "../plugins/github/utils/branch-matcher";

/**
 * The branch Start and Ship push to. It follows the project's GitHub branch
 * pattern, so the GitHub integration links the pull request to the task.
 * A custom regex can't generate a name, so it falls back to the default.
 *
 * `workBranch` is the branch the task's last Start or Ship pushed. It is kept
 * while the pattern still matches it as this task's, so a title edit doesn't
 * open a second pull request; another pattern or task gets a new name.
 */
export function agentBranchName(input: {
  pattern: string | undefined;
  projectSlug: string;
  taskNumber: number;
  taskTitle: string;
  taskType: string;
  workBranch: string | null;
}): string {
  const pattern =
    input.pattern &&
    (branchPatterns as readonly string[]).includes(input.pattern)
      ? input.pattern
      : TYPED_BRANCH_PATTERN;
  if (
    input.workBranch &&
    extractTaskNumberFromBranch(
      input.workBranch,
      { branchPattern: pattern },
      input.projectSlug,
    ) === input.taskNumber
  )
    return input.workBranch;
  return generateBranchName(
    pattern,
    input.projectSlug,
    input.taskNumber,
    input.taskTitle,
    input.taskType,
  );
}
