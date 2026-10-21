import { ChevronDown, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { MilestoneDraftTaskRow } from "@/components/task/milestones/milestone-draft-task-row";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { MAX_FEATURE_COMPOSITION_ITEMS } from "./draft";
import type { FeatureMilestoneDraft, FeatureNewTaskDraft } from "./types";

export function NewWork({
  value,
  milestone,
  onChange,
  disabled,
  children,
}: {
  value: FeatureNewTaskDraft[];
  milestone: FeatureMilestoneDraft;
  onChange: (value: FeatureNewTaskDraft[]) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const drafts = value.filter((task) => task.milestoneKey === milestone.key);
  return (
    <section
      className="min-w-0 space-y-2 border-t border-border pt-3"
      aria-label={t("tasks:featureComposer.work")}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {t("tasks:featureComposer.work")}
        </h3>
        <div className="flex items-center gap-2">
          <Menu>
            <MenuTrigger
              disabled={
                disabled || value.length >= MAX_FEATURE_COMPOSITION_ITEMS
              }
              aria-label={t("tasks:createMenu.label")}
              render={<Button type="button" size="xs" variant="outline" />}
            >
              <Plus aria-hidden="true" />
              {t("tasks:createMenu.new")}
              <ChevronDown className="size-3" aria-hidden="true" />
            </MenuTrigger>
            <MenuPopup align="end" finalFocus={false}>
              {(["task", "bug"] as const).map((type) => (
                <MenuItem
                  key={type}
                  disabled={
                    disabled || value.length >= MAX_FEATURE_COMPOSITION_ITEMS
                  }
                  onClick={() => {
                    if (
                      !disabled &&
                      value.length < MAX_FEATURE_COMPOSITION_ITEMS
                    ) {
                      const key = crypto.randomUUID();
                      setFocusKey(key);
                      onChange([
                        ...value,
                        {
                          key,
                          title: "",
                          type,
                          milestoneKey: milestone.key,
                        },
                      ]);
                    }
                  }}
                >
                  <TaskTypeGlyph type={type} decorative />
                  {t(
                    type === "task"
                      ? "tasks:createMenu.newTask"
                      : "tasks:createMenu.newBug",
                  )}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        </div>
      </div>
      {children}
      {drafts.map((task) => (
        <div
          key={task.key}
          className="min-w-0 space-y-2 rounded-lg border border-border p-2.5"
          onFocusCapture={() => {
            if (focusKey === task.key) setFocusKey(null);
          }}
        >
          <MilestoneDraftTaskRow
            task={{ id: task.key, title: task.title, type: task.type }}
            index={value.findIndex((item) => item.key === task.key) + 1}
            disabled={disabled}
            autoFocus={focusKey === task.key}
            onChange={({ title, type }) => {
              if (!disabled)
                onChange(
                  value.map((item) =>
                    item.key === task.key ? { ...item, title, type } : item,
                  ),
                );
            }}
            onRemove={() =>
              !disabled &&
              onChange(value.filter((item) => item.key !== task.key))
            }
          />
        </div>
      ))}
      {drafts.some((task) => !task.title.trim()) && (
        <p className="text-xs text-destructive-foreground">
          {t("tasks:milestones.newTaskTitleRequired")}
        </p>
      )}
    </section>
  );
}
