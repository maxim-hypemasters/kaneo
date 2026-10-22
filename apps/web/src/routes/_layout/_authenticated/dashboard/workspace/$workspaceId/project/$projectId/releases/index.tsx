import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ReleaseListPage } from "@/components/releases/list/release-list-page";
import { isReleaseView, type ReleaseView } from "@/lib/releases/release-view";
import { useUserPreferencesStore } from "@/store/user-preferences";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/releases/",
)({
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: ReleaseView } => ({
    view: isReleaseView(search.view) ? search.view : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId, workspaceId } = Route.useParams();
  const { view: requestedView } = Route.useSearch();
  const navigate = Route.useNavigate();
  const rememberedView = useUserPreferencesStore(
    (state) => state.releaseViews[JSON.stringify([workspaceId, projectId])],
  );
  const view = requestedView ?? rememberedView ?? "overview";

  useEffect(() => {
    // Give the initial view an explicit history entry so Back restores it
    // instead of resolving it against the newer remembered preference.
    if (!requestedView) {
      void navigate({ search: { view }, replace: true });
      return;
    }
    if (rememberedView !== view) {
      useUserPreferencesStore
        .getState()
        .setReleaseView(workspaceId, projectId, view);
    }
  }, [navigate, projectId, rememberedView, requestedView, view, workspaceId]);

  return (
    <ReleaseListPage
      workspaceId={workspaceId}
      projectId={projectId}
      view={view}
      onViewChange={(nextView) => void navigate({ search: { view: nextView } })}
    />
  );
}
