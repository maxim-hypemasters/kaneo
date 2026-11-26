import type { ReadinessVerdict } from "@/fetchers/agent/get-task-agent";

// Named after the Badge variants that show them.
export type ReadinessTone = "error" | "warning" | "success";

type VerdictDisplay = {
  tone: ReadinessTone;
  labelKey: string;
};

const VERDICT_DISPLAY: Record<ReadinessVerdict, VerdictDisplay> = {
  not_ready: { tone: "error", labelKey: "tasks:aiAgent.verdict.notReady" },
  needs_clarification: {
    tone: "warning",
    labelKey: "tasks:aiAgent.verdict.needsClarification",
  },
  ready: { tone: "success", labelKey: "tasks:aiAgent.verdict.ready" },
};

// Kaneo decides the verdict from the project's threshold, so the colour
// follows the verdict rather than fixed score bands.
export function verdictDisplay(verdict: ReadinessVerdict): VerdictDisplay {
  return VERDICT_DISPLAY[verdict];
}

/** How many of `total` meter segments a 0–100 score fills. */
export function filledSegments(score: number, total: number): number {
  if (!Number.isFinite(score)) return 0;
  const clamped = Math.min(100, Math.max(0, score));
  return Math.round((clamped / 100) * total);
}
