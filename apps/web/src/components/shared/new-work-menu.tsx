import { ChevronDown, Diamond, Link, Plus } from "lucide-react";
import { type ReactElement, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import type { TaskType } from "@/types/task";

const OPTIONS = [
  { type: "task", label: "tasks:createMenu.newTask" },
  { type: "feature", label: "tasks:createMenu.newFeature" },
  { type: "bug", label: "tasks:createMenu.newBug" },
] as const;

type NewWorkMenuProps = {
  onSelect?: (type: TaskType) => void;
  onLink?: (kind: "task" | "milestone") => void;
  children?: ReactElement;
  disabled?: boolean;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  align?: "start" | "end";
};

export function NewWorkMenu({
  onSelect,
  onLink,
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
        className={onLink ? "w-64" : "w-44"}
        // Selection opens a dialog or inline input that owns focus; Escape returns it.
        finalFocus={() => !selected.current}
      >
        {onSelect &&
          OPTIONS.map(({ type, label }) => (
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
        {onSelect && onLink && <MenuSeparator />}
        {onLink && (
          <>
            <MenuItem
              onClick={() => {
                selected.current = true;
                onLink("milestone");
              }}
            >
              <Diamond aria-hidden="true" />
              {t("tasks:releases.link.milestoneAction")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                selected.current = true;
                onLink("task");
              }}
            >
              <Link aria-hidden="true" />
              {t("tasks:releases.link.taskAction")}
            </MenuItem>
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}
