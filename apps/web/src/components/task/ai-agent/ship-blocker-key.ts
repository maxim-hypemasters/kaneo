import type { ShipBlocker } from "@/fetchers/agent/get-task-agent";

const BLOCKER_KEYS: Record<ShipBlocker, string> = {
  agent_disabled: "tasks:aiAgent.blockers.agentDisabled",
  no_repository: "tasks:aiAgent.blockers.noRepository",
  runner_missing: "tasks:aiAgent.blockers.runnerMissing",
  archived: "tasks:aiAgent.blockers.archived",
  in_triage: "tasks:aiAgent.blockers.inTriage",
  not_assessed: "tasks:aiAgent.blockers.notAssessed",
  assessment_outdated: "tasks:aiAgent.blockers.assessmentOutdated",
  open_questions: "tasks:aiAgent.blockers.openQuestions",
  not_ready: "tasks:aiAgent.blockers.notReady",
  ship_in_progress: "tasks:aiAgent.blockers.shipInProgress",
};

export function shipBlockerKey(blocker: ShipBlocker): string {
  return BLOCKER_KEYS[blocker];
}

// The run status already says when a run is working on the task, and the
// readiness card when the workspace has no runner.
const SHOWN_ELSEWHERE: readonly ShipBlocker[] = [
  "ship_in_progress",
  "runner_missing",
];

export function listedShipBlockers(
  blockers: readonly ShipBlocker[],
): ShipBlocker[] {
  return blockers.filter((blocker) => !SHOWN_ELSEWHERE.includes(blocker));
}
