import { useTranslation } from "react-i18next";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import { TASK_TYPES, type TaskType } from "@/types/task";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { chipClass } from "./chip-class";

type TaskTypeChipProps = {
  value: TaskType;
  onChange: (type: TaskType) => void;
  disabled?: boolean;
};

export function TaskTypeChip({ value, onChange, disabled }: TaskTypeChipProps) {
  const { t } = useTranslation();
  const labels = {
    task: "common:modals.createTask.typeTask",
    feature: "common:modals.createTask.typeFeature",
    bug: "common:modals.createTask.typeBug",
  } as const;

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={chipClass(value !== "task")}
          disabled={disabled}
        >
          <TaskTypeGlyph type={value} decorative className="size-3.5" />
          <span className="sr-only">
            {t("common:modals.createTask.type")}
          </span>{" "}
          <span>{t(labels[value])}</span>
        </button>
      </MenuTrigger>
      <MenuPopup align="start" className="w-40">
        <MenuGroup>
          <MenuGroupLabel>{t("common:modals.createTask.type")}</MenuGroupLabel>
          <MenuRadioGroup
            value={value}
            onValueChange={(next) => {
              if (!disabled) onChange(next as TaskType);
            }}
          >
            {TASK_TYPES.map((type) => (
              <MenuRadioItem
                key={type}
                value={type}
                closeOnClick
                disabled={disabled}
              >
                <span className="flex items-center gap-2">
                  <TaskTypeGlyph type={type} decorative />
                  <span>{t(labels[type])}</span>
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
