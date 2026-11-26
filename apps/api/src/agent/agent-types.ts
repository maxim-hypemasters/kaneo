export const AGENT_RUN_KINDS = ["assess", "ship"] as const;
export type AgentRunKind = (typeof AGENT_RUN_KINDS)[number];

export const AGENT_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const READINESS_VERDICTS = [
  "not_ready",
  "needs_clarification",
  "ready",
] as const;
export type ReadinessVerdict = (typeof READINESS_VERDICTS)[number];

export const CHECKLIST_STATUSES = ["met", "partial", "missing"] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

export const AGENT_RUN_EVENT_KINDS = ["step", "tool", "log"] as const;
export type AgentRunEventKind = (typeof AGENT_RUN_EVENT_KINDS)[number];

export type ReadinessChecklistItem = {
  key: string;
  label: string;
  status: ChecklistStatus;
  note?: string;
};

// Options are ordered with the agent's recommendation first.
export type ReadinessQuestion = {
  id: string;
  text: string;
  options: string[];
  blocking: boolean;
};

export type ReadinessSuggestion = {
  id: string;
  title: string;
  markdown: string;
};

export type ShipResult = {
  prUrl: string;
  branch: string;
  summary: string;
};
