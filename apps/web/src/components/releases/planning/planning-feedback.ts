export function planningFeedback(reason: string, t: (key: string) => string) {
  switch (reason) {
    case "backlog":
      return t("tasks:scheduling.reasons.backlog");
    case "archived":
      return t("tasks:scheduling.reasons.archived");
    case "unassigned":
      return t("tasks:scheduling.reasons.unassigned");
    case "no_estimate":
      return t("tasks:scheduling.reasons.noEstimate");
    case "estimate_exhausted":
      return t("tasks:scheduling.reasons.estimateExhausted");
    case "no_calendar":
      return t("tasks:releases.planning.assigneeUnavailable");
    case "dependency_cycle":
      return t("tasks:scheduling.reasons.dependencyCycle");
    case "blocked_dependency":
      return t("tasks:scheduling.reasons.blockedDependency");
    case "external_dependency_unavailable":
      return t("tasks:scheduling.reasons.externalDependencyUnavailable");
    case "outside_planning_horizon":
      return t("tasks:scheduling.reasons.outsidePlanningHorizon");
    case "after_code_freeze":
      return t("tasks:scheduling.reasons.afterCodeFreeze");
    case "after_submission":
      return t("tasks:scheduling.reasons.afterSubmission");
    default:
      return t("tasks:scheduling.reasons.unknown");
  }
}
