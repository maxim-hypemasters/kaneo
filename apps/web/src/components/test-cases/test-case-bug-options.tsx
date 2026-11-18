import { Bug, CircleSlash2 } from "lucide-react";
import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";
import { bugLabel } from "./bug-label";

type BugOption = { id: string; number: number | null; title: string };

// "No bug" first (kept while searching), then the project's bugs. A linked
// bug the list lacks, such as an archived one, keeps its known label.
export function testCaseBugOptions(
  bugs: readonly BugOption[],
  current: { id: string; label: string } | null,
  labels: { none: string },
): OptionMenuItem[] {
  const missing = current !== null && !bugs.some(({ id }) => id === current.id);
  return [
    {
      value: "",
      label: labels.none,
      icon: <CircleSlash2 className="text-muted-foreground" />,
      selected: current === null,
      pinned: true,
    },
    ...(missing
      ? [
          {
            value: current.id,
            label: current.label,
            icon: <Bug className="text-muted-foreground" />,
            selected: true,
          },
        ]
      : []),
    ...bugs.map((bug) => ({
      value: bug.id,
      label: bugLabel(bug),
      icon: <Bug className="text-muted-foreground" />,
      selected: bug.id === current?.id,
    })),
  ];
}
