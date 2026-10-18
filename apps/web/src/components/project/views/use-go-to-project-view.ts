import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useUserPreferencesStore } from "@/store/user-preferences";
import {
  isTaskLayoutView,
  PROJECT_ROUTE_PATHS,
  type ProjectRoute,
  type ProjectView,
  routeForView,
} from "./project-views";

export function useGoToProjectView({
  workspaceId,
  projectId,
  currentRoute,
}: {
  workspaceId: string;
  projectId: string;
  currentRoute: ProjectRoute;
}) {
  const navigate = useNavigate();
  const setViewMode = useUserPreferencesStore((state) => state.setViewMode);
  const setTaskLayout = useUserPreferencesStore((state) => state.setTaskLayout);

  return useCallback(
    (view: ProjectView) => {
      if (view === "board" || view === "list") setViewMode(view);
      if (isTaskLayoutView(view)) setTaskLayout(view);
      const route = routeForView(view);
      // A release's page shares the Releases route; going to Releases from
      // there opens the list.
      if (route === currentRoute && route !== "releases") return;
      navigate({
        to: PROJECT_ROUTE_PATHS[route],
        params: { workspaceId, projectId },
      });
    },
    [
      currentRoute,
      navigate,
      projectId,
      setTaskLayout,
      setViewMode,
      workspaceId,
    ],
  );
}
