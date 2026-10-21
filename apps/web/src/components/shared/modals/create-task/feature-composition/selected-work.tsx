import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { Button } from "@/components/ui/button";
import { MilestoneChoice } from "./milestone-choice";
import type { FeatureExistingTaskDraft, FeatureMilestoneDraft } from "./types";

export function SelectedWork({
  value,
  milestones,
  onChange,
  disabled,
  milestoneKey,
  focusScopeId,
  heading,
  showHeading = true,
}: {
  value: FeatureExistingTaskDraft[];
  milestones: FeatureMilestoneDraft[];
  onChange: (value: FeatureExistingTaskDraft[]) => void;
  disabled?: boolean;
  milestoneKey: string | null;
  focusScopeId: string;
  heading?: string;
  showHeading?: boolean;
}) {
  const { t } = useTranslation();
  const selected = value.filter((task) => task.milestoneKey === milestoneKey);
  if (!selected.length) return null;
  const label = heading ?? t("tasks:featureComposer.selectedWork");
  return (
    <section aria-label={label} className="min-w-0 space-y-2">
      {showHeading && <h3 className="text-sm font-medium">{label}</h3>}
      {selected.map((task) => (
        <div
          key={task.id}
          id={`${focusScopeId}-existing-row-${task.id}`}
          role="group"
          aria-label={task.title}
          tabIndex={-1}
          className="min-w-0 rounded-lg border border-border p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex min-w-0 items-center gap-2">
            <TaskTypeGlyph
              type={task.type}
              decorative
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span
              className="min-w-0 flex-1 truncate text-sm"
              title={task.title}
            >
              {task.title}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              aria-label={t("tasks:featureComposer.removeExistingTask", {
                title: task.title,
              })}
              onClick={() =>
                !disabled &&
                onChange(value.filter((item) => item.id !== task.id))
              }
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {task.number === null
                ? task.id
                : `${task.projectSlug}-${task.number}`}{" "}
              ·{" "}
              {task.releaseName ??
                t(
                  task.releaseId
                    ? "tasks:releases.unknown"
                    : "tasks:releases.none",
                )}
            </span>
            {milestoneKey === null && milestones.length > 0 && (
              <MilestoneChoice
                milestones={milestones}
                value={task.milestoneKey}
                focusId={`${focusScopeId}-existing-choice-${task.id}`}
                focusTargetId={`${focusScopeId}-existing-row-${task.id}`}
                title={task.title}
                disabled={disabled}
                onChange={(milestoneKey) =>
                  onChange(
                    value.map((item) =>
                      item.id === task.id ? { ...item, milestoneKey } : item,
                    ),
                  )
                }
              />
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
