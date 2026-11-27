import { createId } from "@paralleldrive/cuid2";
import type { PlanningContext } from "../../agent-runner/response";
import type {
  DescriptionSuggestion,
  FieldSuggestion,
  FieldSuggestionKind,
  ReadinessSuggestion,
  TestCaseDraft,
} from "../agent-types";
import type { Recommendations } from "../assessment-schema";
import { TEST_CASES_HEADING, testCasesMarkdown } from "./test-cases-markdown";

// No word boundary after the tag name: parseMentionIds needs none, so
// <kaneo-mentionx id="..."> would still notify.
const LABELLED_MENTION = /<kaneo-mention[^>]*?\blabel="([^"]*)"[^>]*>?/gi;
const MENTION_TAG = /<\/?kaneo-mention[^>]*>?/gi;
const MENTION_PREFIX = /<(\/?kaneo-mention)/gi;

// The model reads text anyone can write, so its output must not mention, and
// thereby notify, people. A mention keeps its label as plain text.
function stripMentions(text: string) {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(LABELLED_MENTION, "$1").replace(MENTION_TAG, "");
  } while (current !== previous);
  // Backstop should the patterns above ever miss a tag parseMentionIds reads.
  return current.replace(MENTION_PREFIX, "&lt;$1").trim();
}

const optionalText = (text: string | null | undefined) =>
  (text && stripMentions(text)) || null;

/**
 * The assessment's suggestions as stored: the description suggestions, plus
 * at most one suggestion per empty field that nobody dismissed and whose ids
 * are among the candidates the model was given.
 */
export function toStoredSuggestions({
  suggestions,
  recommendations,
  planning,
  dismissedKinds,
  task,
  newId = createId,
}: {
  suggestions: ReadonlyArray<{ title: string; markdown: string }>;
  recommendations: Recommendations;
  // Null when the task is gone: only the description suggestions remain.
  planning: PlanningContext | null;
  dismissedKinds: readonly string[];
  task: { featureId: string | null; milestoneId: string | null };
  newId?: () => string;
}): ReadinessSuggestion[] {
  const wanted = (kind: FieldSuggestionKind) =>
    !!planning?.missing.includes(kind) && !dismissedKinds.includes(kind);
  const typed: FieldSuggestion[] = [];
  const described: DescriptionSuggestion[] = [];
  const {
    assignee,
    priority,
    feature,
    milestone,
    release,
    estimate,
    testCases,
  } = recommendations;

  if (
    assignee &&
    wanted("assignee") &&
    planning?.people.some((person) => person.id === assignee.userId)
  )
    typed.push({
      kind: "assignee",
      id: newId(),
      userId: assignee.userId,
      reason: stripMentions(assignee.reason),
    });

  if (priority && wanted("priority"))
    typed.push({
      kind: "priority",
      id: newId(),
      priority: priority.priority,
      reason: stripMentions(priority.reason),
    });

  const pickedFeature =
    feature && planning?.features.find((item) => item.id === feature.featureId);
  if (feature && pickedFeature && wanted("feature"))
    typed.push({
      kind: "feature",
      id: newId(),
      featureId: pickedFeature.id,
      // A milestone of another feature is dropped; the feature still stands.
      milestoneId:
        pickedFeature.milestones.find((item) => item.id === feature.milestoneId)
          ?.id ?? null,
      reason: stripMentions(feature.reason),
    });

  const taskFeature = planning?.features.find(
    (item) => item.id === task.featureId,
  );
  if (
    milestone &&
    wanted("milestone") &&
    taskFeature?.milestones.some((item) => item.id === milestone.milestoneId)
  )
    typed.push({
      kind: "milestone",
      id: newId(),
      milestoneId: milestone.milestoneId,
      reason: stripMentions(milestone.reason),
    });

  if (
    release &&
    wanted("release") &&
    planning?.releases.some((item) => item.id === release.releaseId)
  )
    typed.push({
      kind: "release",
      id: newId(),
      releaseId: release.releaseId,
      reason: stripMentions(release.reason),
    });

  if (estimate && wanted("estimate"))
    typed.push({
      kind: "estimate",
      id: newId(),
      minutes: estimate.minutes,
      reason: stripMentions(estimate.reason),
    });

  const cases: TestCaseDraft[] = (testCases?.cases ?? [])
    .map((item) => ({
      title: stripMentions(item.title),
      steps: optionalText(item.steps),
      expectedResult: optionalText(item.expectedResult),
    }))
    .filter((item) => item.title);
  if (testCases && cases.length && wanted("test_cases")) {
    const reason = stripMentions(testCases.reason ?? "");
    const target = planning?.testCaseTarget;
    if (target === "bug")
      typed.push({
        kind: "test_cases",
        id: newId(),
        target,
        milestoneId: null,
        cases,
        reason,
      });
    else if (target === "milestone" && task.milestoneId)
      typed.push({
        kind: "test_cases",
        id: newId(),
        target,
        milestoneId: task.milestoneId,
        cases,
        reason,
      });
    else if (target === "description")
      described.push({
        kind: "description",
        id: newId(),
        title: TEST_CASES_HEADING,
        markdown: testCasesMarkdown(cases),
        origin: "test_cases",
      });
  }

  const written = suggestions
    .map((item) => ({
      title: stripMentions(item.title),
      markdown: stripMentions(item.markdown),
    }))
    .filter((item) => item.title && item.markdown)
    .map((item): DescriptionSuggestion => ({
      kind: "description",
      id: newId(),
      ...item,
    }));

  return [...typed, ...written, ...described];
}
