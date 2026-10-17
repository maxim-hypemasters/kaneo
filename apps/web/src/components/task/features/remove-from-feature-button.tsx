import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

export function RemoveFromFeatureButton({
  className,
  ...props
}: Omit<ComponentProps<"button">, "children">) {
  const { t } = useTranslation();
  const label = t("tasks:features.remove");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "relative flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 outline-none transition-colors before:absolute before:-inset-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              className,
            )}
            {...props}
          />
        }
      >
        <X aria-hidden="true" className="size-3" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
