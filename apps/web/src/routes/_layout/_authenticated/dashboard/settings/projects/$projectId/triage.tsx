import { createFileRoute } from "@tanstack/react-router";
import { ProjectTriagePage } from "@/components/settings/project-triage/project-triage-page";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/projects/$projectId/triage",
)({
  component: ProjectTriagePage,
});
