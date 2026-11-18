import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetProjectMilestones } from "@/hooks/queries/milestone/use-get-project-milestones";
import { groupMilestonesByFeature } from "./group-milestones-by-feature";

const NONE = "none";

// Picks one of the project's milestones, grouped under their Feature.
export function TestCaseMilestoneSelect({
  projectId,
  value,
  onChange,
  disabled,
}: {
  projectId: string;
  value: string | null;
  onChange: (milestoneId: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { data: milestones = [], isPending } =
    useGetProjectMilestones(projectId);
  const selected = milestones.find((milestone) => milestone.id === value);
  return (
    <Select
      value={value ?? NONE}
      disabled={disabled || isPending}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next === NONE ? null : next);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("tasks:testCases.fields.milestone")}
      >
        <SelectValue>
          {value === null
            ? t("tasks:testCases.noMilestone")
            : selected
              ? `${selected.featureTitle} / ${selected.title}`
              : t("tasks:testCases.hiddenMilestone")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t("tasks:testCases.noMilestone")}</SelectItem>
        {groupMilestonesByFeature(milestones).map((group) => (
          <SelectGroup key={group.featureId}>
            <SelectGroupLabel>{group.featureTitle}</SelectGroupLabel>
            {group.milestones.map((milestone) => (
              <SelectItem key={milestone.id} value={milestone.id}>
                {milestone.title}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
