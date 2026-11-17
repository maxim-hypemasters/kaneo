import { TIME_OFF_NOTIFICATION_TYPES } from "../time-off/time-off-notification-types";
import { type PermissionMap, satisfies } from "../utils/role-permissions";

// Notification types a scoped API key may not list. Time off notices name who
// is away and when, so they need time_off:read; open time off and holiday
// calendar requests also need time_off:approve. Session users and unscoped
// keys see everything.
export function scopeHiddenNotificationTypes(
  scope: PermissionMap | null | undefined,
): string[] {
  if (!scope) return [];
  if (!satisfies(scope, { time_off: ["read"] }))
    return [...TIME_OFF_NOTIFICATION_TYPES];
  if (!satisfies(scope, { time_off: ["approve"] }))
    return ["time_off_requested", "time_off_holiday_calendar_requested"];
  return [];
}
