import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { DraftMilestones } from "./draft-milestones";
import { removeFeatureMilestone } from "./draft";
import { ExistingWorkPicker } from "./existing-work-picker";
import { NewWork } from "./new-work";
import { SelectedWork } from "./selected-work";
import type { FeatureCompositionDraft } from "./types";

export function FeatureComposer({
  projectId,
  workspaceId,
  value,
  onChange,
  disabled,
  canManage,
  defaultReleaseId = null,
}: {
  projectId: string;
  workspaceId: string;
  value: FeatureCompositionDraft;
  onChange: (value: FeatureCompositionDraft) => void;
  disabled?: boolean;
  canManage: boolean;
  defaultReleaseId?: string | null;
}) {
  const { t } = useTranslation();
  const focusScopeId = useId();
  // Keep the prompt content stable while the confirmation closes.
  const [removing, setRemoving] = useState<{
    key: string;
    title: string;
    count: number;
  } | null>(null);
  const [removalOpen, setRemovalOpen] = useState(false);
  return (
    <div className="min-w-0 space-y-6 border-t border-border pt-5">
      {canManage && (
        <DraftMilestones
          projectId={projectId}
          workspaceId={workspaceId}
          value={value.milestones}
          disabled={disabled}
          defaultReleaseId={defaultReleaseId}
          onChange={(milestones) => onChange({ ...value, milestones })}
          onRemove={(key) => {
            if (disabled) return;
            const count = value.newTasks.filter(
              (task) => task.milestoneKey === key,
            ).length;
            if (count) {
              const index = value.milestones.findIndex(
                (item) => item.key === key,
              );
              setRemoving({
                key,
                title:
                  value.milestones[index]?.title.trim() ||
                  t("tasks:featureComposer.draftMilestone", {
                    index: index + 1,
                  }),
                count,
              });
              setRemovalOpen(true);
            } else onChange(removeFeatureMilestone(value, key));
          }}
          renderWork={(milestone) => (
            <NewWork
              value={value.newTasks}
              milestone={milestone}
              disabled={disabled}
              onChange={(newTasks) => onChange({ ...value, newTasks })}
            >
              <SelectedWork
                value={value.existingTasks}
                milestoneKey={milestone.key}
                focusScopeId={focusScopeId}
                milestones={value.milestones}
                disabled={disabled}
                showHeading={false}
                onChange={(existingTasks) =>
                  onChange({ ...value, existingTasks })
                }
              />
            </NewWork>
          )}
        />
      )}
      {canManage && (
        <div className="min-w-0 space-y-4">
          <ExistingWorkPicker
            projectId={projectId}
            value={value.existingTasks}
            disabled={disabled}
            onChange={(existingTasks) => onChange({ ...value, existingTasks })}
          />
          <SelectedWork
            value={value.existingTasks}
            milestoneKey={null}
            focusScopeId={focusScopeId}
            milestones={value.milestones}
            heading={t("tasks:milestones.none")}
            disabled={disabled}
            onChange={(existingTasks) => onChange({ ...value, existingTasks })}
          />
        </div>
      )}
      <ConfirmDialog
        open={removalOpen}
        onOpenChange={(open) => {
          if (!disabled) setRemovalOpen(open);
        }}
        title={t("tasks:featureComposer.removeMilestoneWithWorkTitle")}
        description={t(
          "tasks:featureComposer.removeMilestoneWithWorkDescription",
          {
            title: removing?.title ?? "",
            count: removing?.count ?? 0,
          },
        )}
        confirmLabel={t("tasks:featureComposer.removeMilestoneWithWorkConfirm")}
        pending={disabled}
        onConfirm={() => {
          if (disabled || !removing) return;
          onChange(removeFeatureMilestone(value, removing.key));
          setRemovalOpen(false);
        }}
      />
    </div>
  );
}
