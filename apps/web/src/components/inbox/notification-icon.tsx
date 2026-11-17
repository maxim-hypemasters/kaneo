import {
  Archive,
  AtSign,
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarCog,
  CalendarX,
  CircleCheck,
  History,
  Inbox,
  type LucideIcon,
  MessageSquare,
  SquarePlus,
  Timer,
  TreePalm,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";

const icons: Record<string, LucideIcon> = {
  task_mention: AtSign,
  task_comment: MessageSquare,
  task_assignee_changed: UserRound,
  task_status_changed: History,
  task_created: SquarePlus,
  due_date_reminder: CalendarClock,
  task_overdue: CalendarX,
  time_entry_created: Timer,
  task_triage_new: Inbox,
  task_triage_accepted: CircleCheck,
  task_triage_declined: Archive,
  time_off_requested: TreePalm,
  time_off_approved: CalendarCheck,
  time_off_declined: CalendarX,
  time_off_member_away: TreePalm,
  time_off_holiday_calendar_requested: CalendarCog,
  time_off_holiday_calendar_approved: CalendarCheck,
  time_off_holiday_calendar_declined: CalendarX,
};

export function NotificationIcon({ type }: { type: string }) {
  const Icon = Object.hasOwn(icons, type) ? icons[type] : Bell;

  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        type === "task_overdue"
          ? "bg-destructive/10 text-destructive-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </span>
  );
}
