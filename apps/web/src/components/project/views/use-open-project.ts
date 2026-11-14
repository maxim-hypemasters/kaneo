import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { PROJECT_HOME_PATH } from "./project-views";

// Opening a project from the sidebar, search or a shortcut lands on its home
// page; the "Tasks" entry keeps going to the last task view.
export function useOpenProject() {
  const navigate = useNavigate();

  return useCallback(
    (workspaceId: string, projectId: string) =>
      navigate({
        to: PROJECT_HOME_PATH,
        params: { workspaceId, projectId },
      }),
    [navigate],
  );
}
