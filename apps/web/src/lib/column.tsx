import type { ReactElement } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import columnIcons, {
  DEFAULT_COLUMN_ICON_NAMES,
} from "@/constants/column-icons";

export function getColumnIcon(
  columnId: string,
  isFinal?: boolean,
  iconName?: string | null,
): ReactElement;
export function getColumnIcon(
  columnId: string | null,
  isFinal?: boolean,
  iconName?: string | null,
): ReactElement | null;
export function getColumnIcon(
  columnId: string | null,
  isFinal?: boolean,
  iconName?: string | null,
) {
  if (columnId === null) return null;
  const resolvedIconName =
    iconName ||
    (Object.hasOwn(DEFAULT_COLUMN_ICON_NAMES, columnId)
      ? DEFAULT_COLUMN_ICON_NAMES[
          columnId as keyof typeof DEFAULT_COLUMN_ICON_NAMES
        ]
      : undefined);
  const Icon =
    typeof resolvedIconName === "string" &&
    Object.hasOwn(columnIcons, resolvedIconName) &&
    columnIcons[resolvedIconName as keyof typeof columnIcons];

  if (Icon) {
    return <Icon className="w-4 h-4 text-muted-foreground" />;
  }

  return isFinal ? (
    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
  ) : (
    <Circle className="w-4 h-4 text-muted-foreground" />
  );
}
