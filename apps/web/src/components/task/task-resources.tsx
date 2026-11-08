import { ExternalLinksAccordion } from "@/components/external-links/external-links-accordion";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import type { ExternalLink } from "@/types/external-link";

export function TaskResources({ taskId }: { taskId: string }) {
  const { data: externalLinks = [], isLoading } = useExternalLinks(taskId);
  return (
    <ExternalLinksAccordion
      taskId={taskId}
      externalLinks={externalLinks as ExternalLink[]}
      isLoading={isLoading}
    />
  );
}
