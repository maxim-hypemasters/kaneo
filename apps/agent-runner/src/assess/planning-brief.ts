import type { RunContext } from "../kaneo/client";

export type PlanningContext = NonNullable<RunContext["planning"]>;

/**
 * The task's empty fields and the candidates for them, with the rules for
 * "recommendations". Kaneo drops any pick that breaks them, so these only
 * keep the model from wasting picks. Compact JSON keeps every string on one
 * line, so nothing in a name can close the fence.
 */
export function planningBrief(planning: PlanningContext): string {
  if (!planning.missing.length)
    return '"recommendations": leave it out, since the task has no empty fields to fill.';
  return `The task's empty fields ("missing") and the candidates for them, as data:
\`\`\`json
${JSON.stringify(planning)}
\`\`\`

"recommendations": pick values for the empty fields, under these rules:
- Fill only the kinds in "missing" (test_cases is "testCases"), at most one pick per kind, and leave out a kind no candidate clearly fits.
- Use only ids listed above: people for the assignee, features for the feature, a milestone listed under its feature, releases for the release. "openTasks" is how many open tasks a person already has in this project.
- "estimate.minutes" is the working effort the task needs, not calendar time; one working day is ${planning.estimateDayMinutes} minutes.
- When "missing" has test_cases, give 2 to 5 concrete "testCases.cases" for this task, each a title with steps and the expected result, and leave test cases out of "suggestions".
- Each "reason" is at most 200 characters, names nobody but the person picked, and never quotes other tasks.
- A "reason" never quotes task counts or other people's workload.`;
}
