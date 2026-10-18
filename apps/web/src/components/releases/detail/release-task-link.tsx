import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type ReleaseTaskLinkProps = {
  workspaceId: string;
  projectId: string;
  releaseId: string;
  taskId: string;
  className?: string;
  "aria-describedby"?: string;
  children: ReactNode;
};

// Opens a task's sheet over the release page. data-task-id lets the sheet hand
// focus back to the link when it closes.
export function ReleaseTaskLink({
  workspaceId,
  projectId,
  releaseId,
  taskId,
  className,
  "aria-describedby": describedBy,
  children,
}: ReleaseTaskLinkProps) {
  return (
    <Link
      to="/dashboard/workspace/$workspaceId/project/$projectId/releases/$releaseId"
      params={{ workspaceId, projectId, releaseId }}
      search={{ taskId }}
      data-task-id={taskId}
      aria-describedby={describedBy}
      className={className}
    >
      {children}
    </Link>
  );
}
