import { useState } from "react";
import type { AgentAssessment } from "@/fetchers/agent/get-task-agent";

/**
 * Blocking questions open the panel once; after that only the toggle closes
 * it. Answering them removes them from the assessment, which must not
 * collapse the panel the person is working in.
 */
export function useClarifyPanel(
  assessment: AgentAssessment | null | undefined,
) {
  // null until it opens on its own or the person toggles it.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const blocking =
    assessment?.questions.some((question) => question.blocking) ?? false;
  if (chosen === null && blocking) setChosen(true);
  const open = Boolean(assessment) && (chosen ?? blocking);

  return { open, toggle: () => setChosen(!open) };
}
