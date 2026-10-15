import { useUserPreferencesStore } from "@/store/user-preferences";
import type { ProjectRoute } from "./project-views";

// Opening a project counts as picking its default view, so the board shows
// the chosen board or list mode. ProjectLayout records whichever view ends up
// shown as the task layout. A hover preload only resolves the route; it must
// not switch the view of the project that is open right now.
export function applyDefaultProjectView({
  preload,
}: {
  preload: boolean;
}): Extract<ProjectRoute, "board" | "gantt"> {
  const { defaultProjectView, setViewMode } =
    useUserPreferencesStore.getState();
  if (!preload && defaultProjectView !== "gantt") {
    setViewMode(defaultProjectView);
  }
  return defaultProjectView === "gantt" ? "gantt" : "board";
}
