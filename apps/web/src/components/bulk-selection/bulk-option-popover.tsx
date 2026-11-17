import { type ReactNode, useCallback, useState } from "react";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { barButtonClass } from "./bar-button-class";
import { BarTooltip } from "./bar-tooltip";
import type { BulkPicker } from "./bulk-request-store";
import { useBulkPickerRequest } from "./use-bulk-picker-request";

type BulkOptionPopoverProps = {
  icon: ReactNode;
  label: string;
  placeholder: string;
  options: OptionMenuItem[];
  onSelect: (value: string) => void;
  className?: string;
  picker?: BulkPicker;
  onDismiss?: () => void;
  returnFocus?: () => HTMLElement | null;
  // Told whenever the picker opens or closes, including by a shortcut.
  onOpenChange?: (open: boolean) => void;
};

export function BulkOptionPopover({
  icon,
  label,
  placeholder,
  options,
  onSelect,
  className,
  picker,
  onDismiss,
  returnFocus,
  onOpenChange,
}: BulkOptionPopoverProps) {
  const [open, setOpenState] = useState(false);
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const { openedByRequest, openedManually } = useBulkPickerRequest(
    picker,
    setOpen,
  );

  const select = (value: string) => {
    setOpen(false);
    onSelect(value);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          openedManually();
          return;
        }
        onDismiss?.();
      }}
    >
      <BarTooltip label={label}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className={
                className ? `${barButtonClass} ${className}` : barButtonClass
              }
            />
          }
        >
          {icon}
          <span className="max-lg:sr-only">{label}</span>
        </PopoverTrigger>
      </BarTooltip>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-60 p-0"
        finalFocus={() => (openedByRequest() && returnFocus?.()) || true}
      >
        <OptionMenu
          label={label}
          placeholder={placeholder}
          options={options}
          onSelect={select}
        />
      </PopoverContent>
    </Popover>
  );
}
