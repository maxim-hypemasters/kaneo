const TIME_OFF_NOTIFICATION_TYPES = [
  "time_off_requested",
  "time_off_approved",
  "time_off_declined",
  "time_off_member_away",
  "time_off_holiday_calendar_requested",
  "time_off_holiday_calendar_approved",
  "time_off_holiday_calendar_declined",
] as const;

export type TimeOffNotificationType =
  (typeof TIME_OFF_NOTIFICATION_TYPES)[number];

export function isTimeOffNotificationType(
  type: string,
): type is TimeOffNotificationType {
  return (TIME_OFF_NOTIFICATION_TYPES as readonly string[]).includes(type);
}
