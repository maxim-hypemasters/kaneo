import { Ban, Circle, CircleCheck, CircleX } from "lucide-react";
import type { TestCaseStatus } from "@/fetchers/test-case/types";

const ICONS = {
  not_run: { Icon: Circle, className: "text-muted-foreground" },
  passed: { Icon: CircleCheck, className: "text-success-foreground" },
  failed: { Icon: CircleX, className: "text-destructive-foreground" },
  blocked: { Icon: Ban, className: "text-warning-foreground" },
} satisfies Record<TestCaseStatus, unknown>;

export function TestCaseStatusIcon({ status }: { status: TestCaseStatus }) {
  const { Icon, className } = ICONS[status];
  return (
    <Icon aria-hidden="true" className={`size-3.5 shrink-0 ${className}`} />
  );
}
