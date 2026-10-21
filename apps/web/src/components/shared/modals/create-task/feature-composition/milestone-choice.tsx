import { ChevronDown, Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import type { FeatureMilestoneDraft } from "./types";

const NO_MILESTONE = ":none";

export function MilestoneChoice({
  milestones,
  value,
  title,
  onChange,
  disabled,
  allowNone = true,
  focusId,
  focusTargetId,
}: {
  milestones: FeatureMilestoneDraft[];
  value: string | null;
  title: string;
  onChange: (key: string | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
  focusId: string;
  focusTargetId: string;
}) {
  const { t } = useTranslation();
  const options = [
    ...(allowNone
      ? [{ key: NO_MILESTONE, title: t("tasks:milestones.none") }]
      : []),
    ...milestones.map((milestone, index) => ({
      key: milestone.key,
      title:
        milestone.title.trim() ||
        t("tasks:featureComposer.draftMilestone", { index: index + 1 }),
    })),
  ];
  const label =
    options.find((option) => option.key === value)?.title ??
    t("tasks:milestones.none");
  return (
    <Menu>
      <MenuTrigger
        id={focusId}
        disabled={disabled}
        aria-label={t("tasks:featureComposer.workMilestone", { title })}
        title={label}
        render={<Button type="button" variant="outline" size="sm" />}
        className="min-w-0 max-w-full justify-start"
      >
        <Diamond aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden="true" className="ml-auto size-3 shrink-0" />
      </MenuTrigger>
      <MenuPopup
        className="max-h-64 min-w-44 max-w-72 overflow-y-auto"
        align="start"
        // The assignment selector disappears after work enters a card.
        finalFocus={() =>
          document.getElementById(focusId) ??
          document.getElementById(focusTargetId) ??
          true
        }
      >
        <MenuRadioGroup
          value={value ?? NO_MILESTONE}
          onValueChange={(key) => {
            if (
              !disabled &&
              (allowNone || key !== NO_MILESTONE) &&
              options.some((option) => option.key === key)
            ) {
              onChange(key === NO_MILESTONE ? null : key);
              // The old menu unmounts when work enters its destination card.
              requestAnimationFrame(() => {
                document.getElementById(focusTargetId)?.focus();
              });
            }
          }}
        >
          {options.map((option) => (
            <MenuRadioItem
              key={option.key}
              value={option.key}
              disabled={disabled}
              closeOnClick
            >
              <span className="truncate" title={option.title}>
                {option.title}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
