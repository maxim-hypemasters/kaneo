import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { applyDefaultProjectView } from "./apply-default-project-view";
import { PROJECT_ROUTE_PATHS } from "./project-views";

// Resolves the default view here instead of through the project index route.
// The index redirect would add a second history entry when the project is
// already open; a direct target lets the router treat that as a reload.
export function useOpenProject() {
  const navigate = useNavigate();

  return useCallback(
    (workspaceId: string, projectId: string) =>
      navigate({
        to: PROJECT_ROUTE_PATHS[applyDefaultProjectView({ preload: false })],
        params: { workspaceId, projectId },
      }),
    [navigate],
  );
}
