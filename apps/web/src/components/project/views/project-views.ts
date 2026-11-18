import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ChartGantt,
  Rows3,
  SquareKanban,
  SquircleDashed,
} from "lucide-react";
import type { TaskLayout } from "@/store/user-preferences";
import type { TaskType } from "@/types/task";

export type ProjectView =
  | "board"
  | "list"
  | "backlog"
  | "triage"
  | "features"
  | "releases"
  | "testCases"
  | "calendar"
  | "gantt";

export type ProjectRoute =
  | "board"
  | "backlog"
  | "triage"
  | "features"
  | "releases"
  | "testCases"
  | "calendar"
  | "gantt";

export const PROJECT_ROUTE_PATHS = {
  board: "/dashboard/workspace/$workspaceId/project/$projectId/board",
  backlog: "/dashboard/workspace/$workspaceId/project/$projectId/backlog",
  triage: "/dashboard/workspace/$workspaceId/project/$projectId/triage",
  features: "/dashboard/workspace/$workspaceId/project/$projectId/features",
  releases: "/dashboard/workspace/$workspaceId/project/$projectId/releases",
  testCases: "/dashboard/workspace/$workspaceId/project/$projectId/test-cases",
  calendar: "/dashboard/workspace/$workspaceId/project/$projectId/calendar",
  gantt: "/dashboard/workspace/$workspaceId/project/$projectId/gantt",
} as const;

// The project's own page (Overview and Documents) sits next to its views.
export type ProjectPage = ProjectRoute | "home";

export const PROJECT_HOME_PATH =
  "/dashboard/workspace/$workspaceId/project/$projectId" as const;

export const PROJECT_PAGE_PATHS = {
  home: PROJECT_HOME_PATH,
  ...PROJECT_ROUTE_PATHS,
} as const;

export const PROJECT_VIEWS: ReadonlyArray<{
  id: ProjectView;
  labelKey: string;
  icon: LucideIcon;
}> = [
  {
    id: "board",
    labelKey: "tasks:view.board",
    icon: SquareKanban,
  },
  {
    id: "list",
    labelKey: "tasks:view.list",
    icon: Rows3,
  },
  {
    id: "backlog",
    labelKey: "tasks:view.backlog",
    icon: SquircleDashed,
  },
  {
    id: "calendar",
    labelKey: "tasks:calendar.title",
    icon: CalendarDays,
  },
  {
    id: "gantt",
    labelKey: "tasks:view.gantt",
    icon: ChartGantt,
  },
];

export function routeForView(view: ProjectView): ProjectRoute {
  return view === "list" ? "board" : view;
}

export function resolveProjectView(
  route: ProjectRoute,
  viewMode: "board" | "list",
): ProjectView {
  return route === "board" ? viewMode : route;
}

// The views that show the project's tasks; Backlog, Triage, Releases and
// Test cases are planning pages next to them.
export function isTaskLayoutView(view: ProjectView): view is TaskLayout {
  return (
    view !== "backlog" &&
    view !== "triage" &&
    view !== "releases" &&
    view !== "features" &&
    view !== "testCases"
  );
}

// The task views create tasks and bugs; features are created from Features.
export const TASK_VIEW_CREATE_TYPES: readonly TaskType[] = ["task", "bug"];

export const TASK_LAYOUTS = PROJECT_VIEWS.filter((view) =>
  isTaskLayoutView(view.id),
);

export function tasksViewFor(
  taskLayout: TaskLayout,
  viewMode: "board" | "list",
): ProjectView {
  return taskLayout === "calendar" || taskLayout === "gantt"
    ? taskLayout
    : viewMode;
}
