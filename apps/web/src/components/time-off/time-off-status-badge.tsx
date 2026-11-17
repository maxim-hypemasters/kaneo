import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { TimeOffStatus } from "@/fetchers/time-off/types";
import { cn } from "@/lib/cn";
import { TIME_OFF_STATUS_LABEL_KEYS } from "./time-off-status-labels";

const VARIANTS = {
  pending: "warning",
  approved: "success",
  declined: "error",
  cancelled: "outline",
} as const satisfies Record<TimeOffStatus, string>;

// The text always shows, so colour is never the only signal.
export function TimeOffStatusBadge({
  status,
  className,
}: {
  status: TimeOffStatus;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Badge variant={VARIANTS[status]} className={cn("shrink-0", className)}>
      {t(TIME_OFF_STATUS_LABEL_KEYS[status])}
    </Badge>
  );
}
