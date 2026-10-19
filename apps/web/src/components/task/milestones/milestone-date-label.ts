import { formatDateShort } from "@/lib/format";
import type { Milestone } from "@/fetchers/milestone/milestones";
type Translate = (key: string, options: Record<string, unknown>) => string;
export function milestoneDateLabel(
  milestone: Pick<Milestone, "startDate" | "endDate">,
  t: Translate,
) {
  const start = milestone.startDate
    ? formatDateShort(`${milestone.startDate}T12:00:00`)
    : null;
  const end = milestone.endDate
    ? formatDateShort(`${milestone.endDate}T12:00:00`)
    : null;
  if (start && end) return t("tasks:milestones.dateRange", { start, end });
  if (start) return t("tasks:milestones.startsOn", { date: start });
  if (end) return t("tasks:milestones.endsOn", { date: end });
  return null;
}
