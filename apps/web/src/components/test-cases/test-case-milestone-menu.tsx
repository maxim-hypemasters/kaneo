import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { useGetProjectMilestones } from "@/hooks/queries/milestone/use-get-project-milestones";
import type { LinkChoice } from "./link-choice";
import { testCaseMilestoneOptions } from "./test-case-milestone-options";

export function TestCaseMilestoneMenu({
  projectId,
  value,
  onSelect,
}: {
  projectId: string;
  value: LinkChoice;
  onSelect: (choice: LinkChoice) => void;
}) {
  const { t } = useTranslation();
  const {
    data: milestones = [],
    isPending,
    isError,
  } = useGetProjectMilestones(projectId);
  return (
    <OptionMenu
      label={t("tasks:testCases.fields.milestone")}
      placeholder={t("tasks:testCases.pickers.milestone")}
      options={testCaseMilestoneOptions(milestones, value?.id ?? null, {
        none: t("tasks:testCases.noMilestone"),
        hidden: t("tasks:testCases.hiddenMilestone"),
      })}
      // Milestone titles can start with a digit ("2.0 polish").
      numberShortcuts={false}
      status={
        isPending
          ? t("tasks:milestones.loading")
          : isError
            ? t("tasks:milestones.loadError")
            : undefined
      }
      onSelect={(id) => {
        const milestone = milestones.find((item) => item.id === id);
        onSelect(
          milestone
            ? { id, label: milestone.title }
            : id && id === value?.id
              ? value
              : null,
        );
      }}
    />
  );
}
