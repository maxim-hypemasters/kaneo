import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";

const priorities = ["no-priority", "low", "medium", "high", "urgent"];

export function ReleasePlanPriorityInput({
  value,
  editable,
  disabled,
  saving,
  error,
  onSave,
}: {
  value: string;
  editable: boolean;
  disabled?: boolean;
  saving: boolean;
  error: string | null;
  onSave: (priority: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "no-priority");
  const priority = value || "no-priority";
  const label = getPriorityLabel(priority);
  const blocked = disabled || saving;
  const save = async (next: string) => {
    if (blocked) return;
    setDraft(next);
    if (await onSave(next)) setOpen(false);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {editable ? (
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (saving || (next && disabled)) return;
            if (next && !error) setDraft(priority);
            setOpen(next);
          }}
        >
          <PopoverTrigger
            disabled={blocked}
            aria-label={`${t("tasks:priority.label")}: ${label}`}
            render={<Button type="button" variant="outline" size="xs" />}
          >
            {getPriorityIcon(priority)}
            {label}
          </PopoverTrigger>
          <PopoverContent
            className="w-60 max-w-[calc(100vw-2rem)] p-0"
            align="start"
          >
            <PopoverTitle className="sr-only">
              {t("tasks:priority.label")}
            </PopoverTitle>
            <div inert={blocked || undefined}>
              <OptionMenu
                label={t("tasks:priority.label")}
                placeholder={t("tasks:bulk.priorityPlaceholder")}
                options={priorities.map((option) => ({
                  value: option,
                  label: getPriorityLabel(option),
                  icon: getPriorityIcon(option),
                  selected: draft === option,
                }))}
                onSelect={(next) => void save(next)}
              />
            </div>
            {error && (
              <div className="space-y-2 border-t p-3">
                <p role="alert" className="text-xs text-destructive-foreground">
                  {error}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={blocked}
                  onClick={() => void save(draft)}
                >
                  {t("common:error.tryAgain")}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      ) : (
        <span className="inline-flex min-h-7 items-center gap-1.5 text-xs text-muted-foreground sm:min-h-6">
          {getPriorityIcon(priority)}
          {label}
        </span>
      )}
      {error && (!open || !editable) && (
        <p role="alert" className="text-xs text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
