import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { formatEstimate } from "@/components/task/estimate/effort";
import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";
import { NestedDetails } from "./nested-details";
import { withKeys } from "./with-keys";

type Nested = NonNullable<NonNullable<AssistantMessage["preview"]>["nested"]>;
type NestedTask = Nested["tasks"][number];

/**
 * The tasks under one milestone of a card's nested work. A new task shows
 * its type (a Task unless it says Bug) and estimate; existing work moved in
 * is marked as such.
 */
export function NestedTaskList({ tasks }: { tasks: NestedTask[] }) {
  const { t } = useTranslation();
  if (tasks.length === 0) return null;

  const typeLabel = (task: NestedTask) => {
    const type = task.type ?? (task.existing ? null : "task");
    if (type === "bug") return t("workspace:assistant.proposal.nested.bug");
    if (type === "task") return t("workspace:assistant.proposal.nested.task");
    return null;
  };

  return (
    <ul className="mt-0.5 list-disc ps-5 text-foreground/90">
      {withKeys(tasks, (task) => task.title).map(({ key, item }) => (
        <li key={key}>
          <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
            <span>{item.title}</span>
            {item.existing ? (
              <Badge variant="outline" size="sm">
                {t("workspace:assistant.proposal.nested.existing")}
              </Badge>
            ) : null}
            <NestedDetails
              values={[
                typeLabel(item),
                item.estimateSeconds
                  ? t("workspace:assistant.proposal.nested.estimate", {
                      value: formatEstimate(item.estimateSeconds),
                    })
                  : null,
              ]}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
