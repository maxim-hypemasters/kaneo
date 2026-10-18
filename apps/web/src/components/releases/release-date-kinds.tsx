import type { LucideIcon } from "lucide-react";
import { Flag, Send, Snowflake } from "lucide-react";
import type { ReleaseDateKind, ReleaseDates } from "@/types/release";

export type ReleaseDateKindStyle = {
  kind: ReleaseDateKind;
  field: keyof ReleaseDates;
  icon: LucideIcon;
  labelKey: string;
  iconClassName: string;
  // Border style and colour for a line drawn with a border (border-l-2 for a
  // vertical one). The style tells the kinds apart without colour.
  lineClassName: string;
};

// Shared by the Gantt lines and the release timeline, in date order.
export const RELEASE_DATE_KINDS = {
  start: {
    kind: "start",
    field: "startDate",
    icon: Flag,
    labelKey: "tasks:releases.dates.start",
    iconClassName: "text-success",
    lineClassName: "border-dotted border-success/70",
  },
  codeFreeze: {
    kind: "codeFreeze",
    field: "codeFreezeDate",
    icon: Snowflake,
    labelKey: "tasks:releases.dates.codeFreeze",
    iconClassName: "text-info",
    lineClassName: "border-dashed border-info/80",
  },
  submission: {
    kind: "submission",
    field: "submissionDate",
    icon: Send,
    labelKey: "tasks:releases.dates.submission",
    iconClassName: "text-foreground/70",
    lineClassName: "border-solid border-foreground/60",
  },
} as const satisfies Record<ReleaseDateKind, ReleaseDateKindStyle>;

export const RELEASE_DATE_KIND_ORDER: readonly ReleaseDateKind[] = [
  "start",
  "codeFreeze",
  "submission",
];
