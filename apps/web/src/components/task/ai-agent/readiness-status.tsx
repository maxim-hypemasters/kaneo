import { ClockIcon, Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { cn } from "@/lib/cn";
import type { AssessState } from "./assess-state";

type ReadinessStatusProps = {
  state: AssessState;
  failure: TaskAgent["lastAssessFailure"];
};

export function ReadinessStatus({ state, failure }: ReadinessStatusProps) {
  const { t } = useTranslation();
  let content: ReactNode = null;
  if (state === "assessing") {
    content = (
      <>
        <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
        {t("tasks:aiAgent.assessing")}
      </>
    );
  } else if (state === "scheduled") {
    content = (
      <>
        <ClockIcon aria-hidden="true" className="size-3" />
        {t("tasks:aiAgent.assessScheduled")}
      </>
    );
  } else if (failure) {
    content = t("tasks:aiAgent.checkFailed", {
      reason:
        failure.message || failure.code || t("tasks:aiAgent.unknownError"),
    });
  }

  return (
    // Always mounted, so screen readers hear each change of its text; hidden
    // visually while empty so it takes no room.
    <p
      role="status"
      className={
        content === null
          ? "sr-only"
          : cn(
              "flex items-center gap-1 break-words text-xs",
              state === "assessing" || state === "scheduled"
                ? "text-muted-foreground"
                : "text-destructive",
            )
      }
    >
      {content}
    </p>
  );
}
