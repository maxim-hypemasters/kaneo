import type { ComponentProps } from "react";
import { DatePickerMenu } from "@/components/common/date-picker/date-picker-menu";
import { useAssigneeBlockedDays } from "@/components/time-off/away/use-assignee-blocked-days";

type AssigneeDatePickerMenuProps = Omit<
  ComponentProps<typeof DatePickerMenu>,
  "blockedDays"
> & {
  assignee: { userId: string | null; name: string | null };
};

// A task date picker that can't pick a day the assignee is away. Render it
// inside the open popover only, so closed date chips load nothing.
export function AssigneeDatePickerMenu({
  assignee,
  ...props
}: AssigneeDatePickerMenuProps) {
  const blockedDays = useAssigneeBlockedDays(assignee, props.value);
  return <DatePickerMenu {...props} blockedDays={blockedDays} />;
}
