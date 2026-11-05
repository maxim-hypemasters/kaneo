import { Timer } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EstimateInput } from "@/components/task/estimate/estimate-input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { barButtonClass } from "./bar-button-class";
import { BarTooltip } from "./bar-tooltip";

export function BulkEstimatePopover({
  onSelect,
  onDismiss,
}: {
  onSelect: (seconds: number | null) => void;
  onDismiss?: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number | null>(null);
  const [valid, setValid] = useState(true);
  const label = t("tasks:estimate.label");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onDismiss?.();
      }}
    >
      <BarTooltip label={label}>
        <PopoverTrigger
          render={<button type="button" className={barButtonClass} />}
        >
          <Timer />
          <span className="max-lg:sr-only">{label}</span>
        </PopoverTrigger>
      </BarTooltip>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        <div className="flex flex-col gap-3 p-3">
          <p className="text-sm font-medium">{label}</p>
          <EstimateInput
            value={value}
            onChange={setValue}

            onValidityChange={setValid}
            inputClassName="w-full"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                onSelect(null);
              }}
            >
              {t("tasks:estimate.clear")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!valid}
              onClick={() => {
                setOpen(false);
                onSelect(value);
              }}
            >
              {t("tasks:estimate.save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
