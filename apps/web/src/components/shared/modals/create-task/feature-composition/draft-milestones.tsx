import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MilestonePlanningFields } from "@/components/task/milestones/milestone-planning-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_FEATURE_COMPOSITION_ITEMS } from "./draft";
import type { FeatureMilestoneDraft } from "./types";

export function DraftMilestones({
  projectId,
  workspaceId,
  value,
  onChange,
  onRemove,
  defaultReleaseId = null,
  disabled,
  renderWork,
}: {
  projectId: string;
  workspaceId: string;
  value: FeatureMilestoneDraft[];
  onChange: (value: FeatureMilestoneDraft[]) => void;
  onRemove: (key: string) => void;
  defaultReleaseId?: string | null;
  disabled?: boolean;
  renderWork: (milestone: FeatureMilestoneDraft) => ReactNode;
}) {
  const { t } = useTranslation();
  const move = (index: number, offset: number) => {
    if (disabled || index + offset < 0 || index + offset >= value.length)
      return;
    const next = [...value];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  return (
    <section
      className="min-w-0 space-y-3"
      aria-label={t("tasks:milestones.title")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("tasks:milestones.title")}</h3>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled || value.length >= MAX_FEATURE_COMPOSITION_ITEMS}
          onClick={() => {
            if (disabled || value.length >= MAX_FEATURE_COMPOSITION_ITEMS)
              return;
            onChange([
              ...value,
              {
                key: crypto.randomUUID(),
                title: "",
                leadId: null,
                priority: "no-priority",
                releaseId: defaultReleaseId,
              },
            ]);
          }}
        >
          <Plus aria-hidden="true" />
          {t("tasks:featureComposer.addMilestone")}
        </Button>
      </div>
      {value.map((milestone, index) => (
        <fieldset
          key={milestone.key}
          className="min-w-0 space-y-3 rounded-lg border border-border p-3"
        >
          <legend className="sr-only">
            {milestone.title.trim() ||
              t("tasks:featureComposer.draftMilestone", { index: index + 1 })}
          </legend>
          <div className="flex min-w-0 items-center gap-1">
            <Input
              autoFocus
              required
              maxLength={255}
              disabled={disabled}
              className="min-w-0 flex-1"
              aria-label={t("tasks:featureComposer.milestoneTitle", {
                index: index + 1,
              })}
              placeholder={t("tasks:milestones.titleLabel")}
              value={milestone.title}
              onChange={(event) =>
                onChange(
                  value.map((item) =>
                    item.key === milestone.key
                      ? { ...item, title: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled || index === 0}
              aria-label={t("tasks:milestones.moveUp")}
              onClick={() => move(index, -1)}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled || index === value.length - 1}
              aria-label={t("tasks:milestones.moveDown")}
              onClick={() => move(index, 1)}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              aria-label={t("tasks:featureComposer.removeMilestone", {
                index: index + 1,
              })}
              onClick={() => !disabled && onRemove(milestone.key)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <MilestonePlanningFields
            projectId={projectId}
            workspaceId={workspaceId}
            creating
            pending={disabled}
            milestone={{
              ...milestone,
              status: "to-do",
              startDate: null,
              endDate: null,
            }}
            onChange={(fields) => {
              if (!disabled)
                onChange(
                  value.map((item) =>
                    item.key === milestone.key ? { ...item, ...fields } : item,
                  ),
                );
            }}
          />
          {renderWork(milestone)}
        </fieldset>
      ))}
    </section>
  );
}
