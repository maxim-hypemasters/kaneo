import { CircleSlash2, Layers } from "lucide-react";
import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";

type FeatureOption = {
  id: string;
  title: string | null;
  displayId: string | null;
};

// "No feature" first (kept while searching), then the features.
export function featureMenuOptions(
  features: readonly FeatureOption[],
  current: string | null,
  labels: { none: string; unknown: string },
): OptionMenuItem[] {
  return [
    {
      value: "",
      label: labels.none,
      icon: <CircleSlash2 className="text-muted-foreground" />,
      selected: !current,
      pinned: true,
    },
    ...features.map((feature) => ({
      value: feature.id,
      label: feature.title ?? labels.unknown,
      hint: feature.displayId ?? undefined,
      icon: <Layers className="text-muted-foreground" />,
      selected: feature.id === current,
    })),
  ];
}
