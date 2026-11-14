import { Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { featureRoute } from "@/components/task/features/feature-route";
import type { FeatureDocumentGroup as Group } from "@/fetchers/project-document/types";
import { cn } from "@/lib/cn";

// A Feature's documents, read-only in place: they belong to the Feature and
// keep its order, newest first.
export function FeatureDocumentGroup({
  group,
  workspaceId,
  projectId,
  expanded,
  selectedId,
  onToggle,
  onOpen,
}: {
  group: Group;
  workspaceId: string;
  projectId: string;
  expanded: boolean;
  selectedId?: string;
  onToggle: () => void;
  onOpen: (documentId: string) => void;
}) {
  const { t } = useTranslation();
  const listId = `feature-documents-${group.id}`;
  return (
    <li className="group/row">
      <div className="flex h-8 min-w-0 items-center gap-1 rounded-md pr-1 pl-1 hover:bg-accent/50">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-sm py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-3.5 transition-transform duration-150 motion-reduce:transition-none",
                expanded && "rotate-90",
              )}
            />
          </span>
          <span className="truncate font-medium" title={group.title}>
            {group.title}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {group.documents.length}
          </span>
        </button>
        <Link
          {...featureRoute(workspaceId, projectId, group.id, {
            featureTab: "documents",
          })}
          aria-label={t("tasks:projectHome.documents.openFeature", {
            title: group.title,
          })}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100 max-md:opacity-100"
        >
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      {expanded && (
        <ul id={listId}>
          {group.documents.map((document) => (
            <li key={document.id}>
              <button
                type="button"
                onClick={() => onOpen(document.id)}
                aria-current={document.id === selectedId ? "page" : undefined}
                className={cn(
                  "flex h-8 w-full min-w-0 items-center gap-2 rounded-md pr-2 pl-7 text-left text-sm outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
                  document.id === selectedId && "bg-accent",
                )}
              >
                <FileText
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="truncate" title={document.title}>
                  {document.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
