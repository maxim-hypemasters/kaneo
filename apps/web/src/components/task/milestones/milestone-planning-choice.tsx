import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
export function MilestonePlanningChoice({
  label,
  children,
  options,
  onSelect,
  disabled,
  loading,
  error,
  onRetry,
}: {
  label: string;
  children: ReactNode;
  options: OptionMenuItem[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="w-full justify-start font-normal"
              disabled={disabled}
              aria-label={label}
            />
          }
        >
          {children}
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <OptionMenu
            label={label}
            options={options}
            placeholder={label}
            onSelect={(value) => {
              onSelect(value);
              setOpen(false);
            }}
            status={loading ? t("common:empty.loading") : undefined}
          />
          {error && (
            <div role="alert" className="p-2 text-sm">
              <span>{t("common:error.title")}</span>
              <Button variant="ghost" size="xs" onClick={onRetry}>
                {t("common:error.tryAgain")}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </label>
  );
}
