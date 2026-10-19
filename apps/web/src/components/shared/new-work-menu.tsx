import { ChevronDown, Plus } from "lucide-react";
import { type ReactElement, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import type { TaskType } from "@/types/task";

const OPTIONS = [
  { type: "task", label: "tasks:createMenu.newTask" },
  { type: "feature", label: "tasks:createMenu.newFeature" },
  { type: "bug", label: "tasks:createMenu.newBug" },
] as const;

type NewWorkMenuProps = {
  onSelect: (type: TaskType) => void;
  children?: ReactElement;
  disabled?: boolean;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  align?: "start" | "end";
};

export function NewWorkMenu({
  onSelect,
  children,
  disabled,
  className,
  size = "sm",
  variant = "default",
  align = "end",
}: NewWorkMenuProps) {
  const { t } = useTranslation();
  const selected = useRef(false);

  return (
    <Menu
      onOpenChange={(open) => {
        if (open) selected.current = false;
      }}
    >
      <MenuTrigger
        disabled={disabled}
        aria-label={t("tasks:createMenu.label")}
        render={
          children ?? (
            <Button size={size} variant={variant} className={className} />
          )
        }
      >
        {children ? undefined : (
          <>
            <Plus aria-hidden="true" />
            {t("tasks:createMenu.new")}
            <ChevronDown className="size-3" aria-hidden="true" />
          </>
        )}
      </MenuTrigger>
      <MenuPopup
        align={align}
        className="w-44"
        // Selection opens a dialog or inline input that owns focus; Escape returns it.
        finalFocus={() => !selected.current}
      >
        {OPTIONS.map(({ type, label }) => (
          <MenuItem
            key={type}
            onClick={() => {
              selected.current = true;
              onSelect(type);
            }}
          >
            <TaskTypeGlyph type={type} decorative />
            {t(label)}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
