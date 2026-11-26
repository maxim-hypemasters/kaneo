import type { StatusTone } from "@/components/settings/status-badge";
import type { AgentRunnerStatus } from "@/fetchers/agent/get-agent-runner";

type RunnerStatusDisplay = {
  tone: StatusTone;
  labelKey: string;
  descriptionKey: string;
};

export function runnerStatusDisplay(
  status: Pick<AgentRunnerStatus, "configured" | "online" | "lastSeenAt">,
): RunnerStatusDisplay {
  if (!status.configured)
    return {
      tone: "neutral",
      labelKey: "settings:aiAgentPage.runner.status.notSetUp",
      descriptionKey: "settings:aiAgentPage.runner.status.notSetUpDescription",
    };
  if (status.online)
    return {
      tone: "success",
      labelKey: "settings:aiAgentPage.runner.status.online",
      descriptionKey: "settings:aiAgentPage.runner.status.onlineDescription",
    };
  return {
    tone: "warning",
    labelKey: "settings:aiAgentPage.runner.status.offline",
    descriptionKey: status.lastSeenAt
      ? "settings:aiAgentPage.runner.status.offlineDescription"
      : "settings:aiAgentPage.runner.status.neverConnectedDescription",
  };
}
