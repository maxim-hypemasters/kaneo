import { type ReactElement, type ReactNode, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// The project's picker: a trigger that opens a searchable option menu. The
// menu mounts on open, so its data loads and its search starts empty then.
export function TestCasePicker({
  trigger,
  disabled,
  width = "w-72",
  children,
}: {
  trigger: ReactElement;
  disabled?: boolean;
  width?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (disabled) return trigger;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className={`${width} p-0`} align="start">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}
