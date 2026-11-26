import type { ReadinessQuestion, ReadinessVerdict } from "./agent-types";

export const SHIP_BLOCKERS = [
  "agent_disabled",
  "no_repository",
  "runner_missing",
  "archived",
  "not_assessed",
  "assessment_outdated",
  "open_questions",
  "not_ready",
  "ship_in_progress",
] as const;
export type ShipBlocker = (typeof SHIP_BLOCKERS)[number];

/** Why Ship is unavailable; an empty list means the task can ship. */
export function computeShipBlockers(input: {
  enabled: boolean;
  repository: string | null;
  hasRunner: boolean;
  archived: boolean;
  assessment: {
    verdict: ReadinessVerdict;
    questions: ReadonlyArray<Pick<ReadinessQuestion, "blocking">>;
    inputHash: string;
  } | null;
  currentInputHash: string;
  shipInProgress: boolean;
}): ShipBlocker[] {
  const blockers: ShipBlocker[] = [];
  if (!input.enabled) blockers.push("agent_disabled");
  if (!input.repository) blockers.push("no_repository");
  if (!input.hasRunner) blockers.push("runner_missing");
  if (input.archived) blockers.push("archived");
  const { assessment } = input;
  if (!assessment) blockers.push("not_assessed");
  else {
    if (assessment.inputHash !== input.currentInputHash)
      blockers.push("assessment_outdated");
    if (assessment.questions.some((question) => question.blocking))
      blockers.push("open_questions");
    else if (assessment.verdict !== "ready") blockers.push("not_ready");
  }
  if (input.shipInProgress) blockers.push("ship_in_progress");
  return blockers;
}
