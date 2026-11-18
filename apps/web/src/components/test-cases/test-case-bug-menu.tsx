import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { bugLabel } from "./bug-label";
import type { LinkChoice } from "./link-choice";
import { projectBugs } from "./project-bugs";
import { testCaseBugOptions } from "./test-case-bug-options";

export function TestCaseBugMenu({
  projectId,
  value,
  onSelect,
}: {
  projectId: string;
  value: LinkChoice;
  onSelect: (choice: LinkChoice) => void;
}) {
  const { t } = useTranslation();
  // The board is usually cached already; this menu only reads its bugs.
  const { data: project, isPending } = useGetTasks(projectId, {
    refetchOnMount: false,
  });
  const bugs = projectBugs(project);
  return (
    <OptionMenu
      label={t("tasks:testCases.fields.bug")}
      placeholder={t("tasks:testCases.pickers.bug")}
      options={testCaseBugOptions(bugs, value, {
        none: t("tasks:testCases.noBug"),
      })}
      numberShortcuts={false}
      status={isPending ? t("tasks:testCases.pickers.loadingBugs") : undefined}
      onSelect={(id) => {
        const bug = bugs.find((item) => item.id === id);
        onSelect(
          bug
            ? { id, label: bugLabel(bug) }
            : id && id === value?.id
              ? value
              : null,
        );
      }}
    />
  );
}
