import { ChevronDown, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { Button } from "@/components/ui/button";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import {
  MAX_MILESTONE_DRAFT_TASKS,
  type MilestoneDraftTask,
} from "./milestone-draft-task";
import { MilestoneDraftTaskRow } from "./milestone-draft-task-row";

export function MilestoneDraftTasks({
  value,
  onChange,
  disabled,
}: {
  value: MilestoneDraftTask[];
  onChange: (tasks: MilestoneDraftTask[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Fieldset className="max-w-none gap-2" disabled={disabled}>
      <div className="flex items-center justify-between gap-2">
        <FieldsetLegend className="text-sm">
          {t("tasks:milestones.newTasks")}
        </FieldsetLegend>
        <div className="flex items-center gap-2">
          {value.length > 0 && (
            <span aria-live="polite" className="text-xs text-muted-foreground">
              {t("tasks:milestones.newTasksCount", { count: value.length })}
            </span>
          )}
          <Menu>
            <MenuTrigger
              disabled={disabled || value.length >= MAX_MILESTONE_DRAFT_TASKS}
              aria-label={t("tasks:createMenu.label")}
              render={<Button type="button" size="xs" variant="outline" />}
            >
              <Plus aria-hidden="true" />
              {t("tasks:createMenu.new")}
              <ChevronDown className="size-3" aria-hidden="true" />
            </MenuTrigger>
            <MenuPopup align="end" className="w-44" finalFocus={false}>
              {(["task", "bug"] as const).map((type) => (
                <MenuItem
                  key={type}
                  onClick={() => {
                    if (disabled || value.length >= MAX_MILESTONE_DRAFT_TASKS)
                      return;
                    onChange([
                      ...value,
                      { id: crypto.randomUUID(), title: "", type },
                    ]);
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
      {value.map((task, index) => (
        <MilestoneDraftTaskRow
          key={task.id}
          task={task}
          index={index + 1}
          disabled={disabled}
          onChange={(updated) =>
            onChange(
              value.map((item) => (item.id === task.id ? updated : item)),
            )
          }
          onRemove={() => onChange(value.filter((item) => item.id !== task.id))}
        />
      ))}
      {value.some((task) => !task.title.trim()) && (
        <p className="text-xs text-destructive-foreground">
          {t("tasks:milestones.newTaskTitleRequired")}
        </p>
      )}
    </Fieldset>
  );
}
