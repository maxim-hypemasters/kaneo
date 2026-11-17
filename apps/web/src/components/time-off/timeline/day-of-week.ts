// 0 (Sunday) to 6 (Saturday) for a YYYY-MM-DD day, wherever the viewer is.
export function dayOfWeek(day: string) {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

// Weekends never count against the allowance.
export function isWeekendDay(day: string) {
  const weekday = dayOfWeek(day);
  return weekday === 0 || weekday === 6;
}
