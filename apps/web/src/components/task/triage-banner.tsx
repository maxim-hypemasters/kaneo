import { Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TriageDecisionButtons } from "@/components/triage-list-view/triage-decision-buttons";
import { useTriageAccess } from "@/hooks/use-triage-access";
import type Task from "@/types/task";

export function TriageBanner({ task }: { task: Task }) {
  const { t } = useTranslation();
  const { canTriage } = useTriageAccess(task.projectId);

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm"
    >
      <Inbox className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-muted-foreground">
        {t(
          canTriage
            ? "tasks:triage.banner.review"
            : "tasks:triage.banner.waiting",
        )}
      </p>
      {canTriage ? (
        <TriageDecisionButtons taskId={task.id} taskTitle={task.title} />
      ) : null}
    </div>
  );
}
