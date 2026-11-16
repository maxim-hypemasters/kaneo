import {
  Archive,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Clock,
  Inbox,
  Search,
} from "lucide-react";
import projectIcons from "./project-icons";

export const DEFAULT_COLUMN_ICON_NAMES = {
  "to-do": "Circle",
  "in-progress": "CircleDot",
  "in-review": "Search",
  done: "CheckCircle2",
  archived: "Archive",
  planned: "Clock",
  triage: "Inbox",
} as const;

const columnIcons = {
  ...projectIcons,
  Circle,
  CircleDot,
  Search,
  CheckCircle2,
  CircleDashed,
  Clock,
  Archive,
  Inbox,
};

export type ColumnIconName = keyof typeof columnIcons;

export default columnIcons;
