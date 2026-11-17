// Days a date picker can't pick, e.g. while the task's assignee is away,
// with what to say about them.
export type BlockedDays = {
  isBlocked: (day: Date) => boolean;
  // Why a typed day can't be picked.
  describe: (day: Date) => string;
  // Explains the struck-through days, while any are near.
  hint?: string;
  // The month grid moved to another month (to load its days).
  onMonthChange?: (month: Date) => void;
};
