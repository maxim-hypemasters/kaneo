import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";
import { NestedDetails } from "./nested-details";
import { NestedTaskList } from "./nested-task-list";
import { withKeys } from "./with-keys";

type Nested = NonNullable<NonNullable<AssistantMessage["preview"]>["nested"]>;

const PRIORITY_KEYS: Record<string, string> = {
  "no-priority": "tasks:priority.no-priority",
  low: "tasks:priority.low",
  medium: "tasks:priority.medium",
  high: "tasks:priority.high",
  urgent: "tasks:priority.urgent",
};

/**
 * The milestones and tasks a new Feature or milestone brings along: each
 * milestone with its lead, release and priority, the release new work
 * outside a milestone goes to, and every task as it will be written.
 */
export function ProposalNested({ nested }: { nested: Nested }) {
  const { t } = useTranslation();
  const labelId = useId();
  const priority = (value: string) =>
    Object.hasOwn(PRIORITY_KEYS, value)
      ? t(PRIORITY_KEYS[value] as string)
      : value;
  const showUnassigned =
    nested.tasks.length > 0 || nested.unassignedReleaseLabel !== null;

  return (
    <div className="flex flex-col gap-1">
      <p id={labelId} className="text-muted-foreground text-xs">
        {t("workspace:assistant.proposal.nested.label")}
      </p>
      <ul aria-labelledby={labelId} className="flex flex-col gap-1.5 text-sm">
        {withKeys(nested.milestones, (milestone) => milestone.title).map(
          ({ key, item }) => (
            <li key={key}>
              <span className="font-medium text-foreground">{item.title}</span>
              <NestedDetails
                className="block"
                values={[
                  item.leadLabel &&
                    t("workspace:assistant.proposal.nested.lead", {
                      name: item.leadLabel,
                    }),
                  item.releaseLabel &&
                    t("workspace:assistant.proposal.nested.release", {
                      name: item.releaseLabel,
                    }),
                  item.priority &&
                    t("workspace:assistant.proposal.nested.priority", {
                      name: priority(item.priority),
                    }),
                ]}
              />
              <NestedTaskList tasks={item.tasks} />
            </li>
          ),
        )}
        {showUnassigned ? (
          <li>
            <span className="text-muted-foreground">
              {t("workspace:assistant.proposal.nested.noMilestone")}
            </span>
            <NestedDetails
              className="block"
              values={[
                nested.unassignedReleaseLabel &&
                  t("workspace:assistant.proposal.nested.unassignedRelease", {
                    name: nested.unassignedReleaseLabel,
                  }),
              ]}
            />
            <NestedTaskList tasks={nested.tasks} />
          </li>
        ) : null}
      </ul>
    </div>
  );
}
