import { CircleSlash2, Diamond } from "lucide-react";
import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";

type MilestoneOption = { id: string; title: string; featureTitle: string };

// "No milestone" first (kept while searching), then each milestone with its
// Feature as the hint. A linked milestone the list lacks shows as hidden.
export function testCaseMilestoneOptions(
  milestones: readonly MilestoneOption[],
  current: string | null,
  labels: { none: string; hidden: string },
): OptionMenuItem[] {
  const missing =
    current !== null && !milestones.some(({ id }) => id === current);
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
            value: current,
            label: labels.hidden,
            icon: <Diamond className="text-muted-foreground" />,
            selected: true,
          },
        ]
      : []),
    ...milestones.map((milestone) => ({
      value: milestone.id,
      label: milestone.title,
      hint: milestone.featureTitle,
      icon: <Diamond className="text-muted-foreground" />,
      selected: milestone.id === current,
    })),
  ];
}
