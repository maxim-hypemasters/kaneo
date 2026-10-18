import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ReleasePhase } from "@/types/release";

const PHASES = {
  upcoming: { labelKey: "tasks:releases.phase.upcoming", variant: "outline" },
  inProgress: {
    labelKey: "tasks:releases.phase.inProgress",
    variant: "success",
  },
  codeFreeze: { labelKey: "tasks:releases.phase.codeFreeze", variant: "info" },
  pastSubmission: {
    labelKey: "tasks:releases.phase.pastSubmission",
    variant: "secondary",
  },
} as const satisfies Record<ReleasePhase, object>;

// The text always shows, so colour is never the only signal.
export function ReleasePhaseBadge({ phase }: { phase: ReleasePhase }) {
  const { t } = useTranslation();
  const { labelKey, variant } = PHASES[phase];

  return (
    <Badge variant={variant} className="shrink-0">
      {t(labelKey)}
    </Badge>
  );
}
