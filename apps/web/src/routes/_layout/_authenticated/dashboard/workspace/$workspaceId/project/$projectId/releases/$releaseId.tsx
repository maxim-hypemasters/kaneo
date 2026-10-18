import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { ReleaseDetailPage } from "@/components/releases/detail/release-detail-page";

type ReleaseSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/releases/$releaseId",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): ReleaseSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { projectId, workspaceId, releaseId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const closeTask = useCallback(() => {
    navigate({ to: ".", search: {}, replace: true });
  }, [navigate]);

  return (
    <ReleaseDetailPage
      workspaceId={workspaceId}
      projectId={projectId}
      releaseId={releaseId}
      taskId={taskId}
      onCloseTask={closeTask}
    />
  );
}
