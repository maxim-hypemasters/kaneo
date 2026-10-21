import { ChevronDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import { TASK_TYPE_LABELS } from "@/lib/task-type";
import type { MilestoneDraftTask } from "./milestone-draft-task";

export function MilestoneDraftTaskRow({
  task,
  index,
  disabled,
  onChange,
  onRemove,
  autoFocus = true,
}: {
  task: MilestoneDraftTask;
  index: number;
  disabled?: boolean;
  onChange: (task: MilestoneDraftTask) => void;
  onRemove: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Menu>
        <MenuTrigger
          disabled={disabled}
          aria-label={t("tasks:milestones.newTaskType", { index })}
          render={<Button type="button" variant="outline" size="sm" />}
        >
          <TaskTypeGlyph type={task.type} decorative />
          <span className="max-sm:sr-only">
            {t(TASK_TYPE_LABELS[task.type])}
          </span>
          <ChevronDown className="size-3" aria-hidden="true" />
        </MenuTrigger>
        <MenuPopup align="start" className="w-36">
          <MenuRadioGroup
            value={task.type}
            onValueChange={(type) => {
              if (!disabled && (type === "task" || type === "bug"))
                onChange({ ...task, type });
            }}
          >
            {(["task", "bug"] as const).map((type) => (
              <MenuRadioItem key={type} value={type} disabled={disabled}>
                <span className="flex items-center gap-2">
                  <TaskTypeGlyph type={type} decorative />
                  {t(TASK_TYPE_LABELS[type])}
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>
      <Input
        autoFocus={autoFocus}
        type="text"
        size="sm"
        required
        disabled={disabled}
        className="min-w-0 flex-1"
        aria-label={t("tasks:milestones.newTaskTitle", { index })}
        placeholder={t("tasks:milestones.titleLabel")}
        aria-invalid={task.title.length > 0 && !task.title.trim()}
        value={task.title}
        onChange={(event) => onChange({ ...task, title: event.target.value })}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        aria-label={t("tasks:milestones.removeNewTask", { index })}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
