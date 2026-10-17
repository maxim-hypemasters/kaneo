import { Layers, Square } from "lucide-react";
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
import type { TaskType } from "@/types/task";
import { chipClass } from "./chip-class";

type TaskTypeChipProps = {
  value: TaskType;
  onChange: (type: TaskType) => void;
  disabled?: boolean;
};

export function TaskTypeChip({ value, onChange, disabled }: TaskTypeChipProps) {
  const { t } = useTranslation();
  const isFeature = value === "feature";
  const Icon = isFeature ? Layers : Square;

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={chipClass(isFeature)}
          disabled={disabled}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          <span className="sr-only">
            {t("common:modals.createTask.type")}
          </span>{" "}
          <span>
            {isFeature
              ? t("common:modals.createTask.typeFeature")
              : t("common:modals.createTask.typeTask")}
          </span>
        </button>
      </MenuTrigger>
      <MenuPopup align="start" className="w-40">
        <MenuGroup>
          <MenuGroupLabel>{t("common:modals.createTask.type")}</MenuGroupLabel>
          <MenuRadioGroup
            value={value}
            onValueChange={(next) => onChange(next as TaskType)}
          >
            <MenuRadioItem value="task" closeOnClick>
              {t("common:modals.createTask.typeTask")}
            </MenuRadioItem>
            <MenuRadioItem value="feature" closeOnClick>
              {t("common:modals.createTask.typeFeature")}
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
