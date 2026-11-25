import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { documentRoute } from "@/components/project/home/documents/document-route";
import { Button } from "@/components/ui/button";
import { useShortcut } from "@/lib/shortcuts/use-shortcut";
import type { DocumentCommentTarget } from "./document-comment-target";

// The document a comment notification is about: its title, the commented
// text, and a link that opens the document on the thread. The title and quote
// are the ones saved with the notification.
export function InboxDocumentComment({
  target,
}: {
  target: DocumentCommentTarget;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const route = documentRoute(target.workspaceId, target.projectId, {
    id: target.documentId,
    featureId: target.featureId,
    commentId: target.commentId,
  });
  useShortcut("openFocusedTask", () => void navigate(route));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-2xl text-foreground tracking-tight">
          <FileText
            aria-hidden="true"
            className="size-5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0">
            {target.title ?? t("tasks:projectHome.documents.untitled")}
          </span>
        </h2>
        <Button variant="outline" size="xs" render={<Link {...route} />}>
          {t("notifications:inbox.openDocument")}
          <ArrowUpRight />
        </Button>
      </div>
      {target.quote && (
        <figure className="flex flex-col gap-1.5">
          <figcaption className="text-muted-foreground text-xs">
            {t("notifications:inbox.commentedText")}
          </figcaption>
          <blockquote className="border-border border-s-2 ps-3 text-[13px] text-foreground/85">
            {target.quote}
          </blockquote>
        </figure>
      )}
    </div>
  );
}
