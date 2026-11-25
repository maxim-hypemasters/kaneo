import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { MentionMember } from "@/components/task/extensions/mention-list";
import { Button } from "@/components/ui/button";
import type { DocumentCommentThread } from "@/fetchers/document-comment/types";
import { cn } from "@/lib/cn";
import { CommentThreadCard, type ThreadActions } from "./comment-thread-card";
import type { ThreadFilter } from "./sort-threads";

const FILTERS: { id: ThreadFilter; labelKey: string }[] = [
  { id: "open", labelKey: "common:documentComments.filterOpen" },
  { id: "resolved", labelKey: "common:documentComments.filterResolved" },
];

// The threads of the open document, beside it on wide screens and over it on
// narrow ones. It is not a modal: the document stays usable while it is open,
// so a highlight can be clicked to find its thread.
export function DocumentCommentsPanel({
  id,
  docked,
  status,
  threads,
  filter,
  activeId,
  detachedIds,
  canComment,
  currentUserId,
  members,
  actions,
  notice,
  draft,
  onFilterChange,
  onActivate,
  onShow,
  onRetry,
  onClose,
}: {
  id: string;
  docked: boolean;
  status: "loading" | "error" | "ready";
  // The threads of the selected filter, in reading order.
  threads: DocumentCommentThread[];
  filter: ThreadFilter;
  activeId: string | null;
  detachedIds: ReadonlySet<string>;
  canComment: boolean;
  currentUserId: string | undefined;
  members: MentionMember[];
  actions: ThreadActions;
  // Something to say above the list, such as a comment that is gone.
  notice?: string | null;
  // The comment being written on a new selection.
  draft?: ReactNode;
  onFilterChange: (filter: ThreadFilter) => void;
  onActivate: (threadId: string) => void;
  onShow: (threadId: string) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <aside
      id={id}
      aria-label={t("common:documentComments.title")}
      className={cn(
        "flex min-h-0 flex-col border-s bg-muted/30",
        docked
          ? "w-80 shrink-0 xl:w-88"
          : "absolute inset-y-0 end-0 z-10 w-full bg-background shadow-lg sm:max-w-sm",
      )}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Escape would close the whole document; here it closes the panel.
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
        <h2 className="me-auto font-medium text-sm">
          {t("common:documentComments.title")}
        </h2>
        {FILTERS.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="xs"
            variant="ghost"
            aria-pressed={filter === option.id}
            className={filter === option.id ? "bg-accent" : undefined}
            onClick={() => onFilterChange(option.id)}
          >
            {t(option.labelKey)}
          </Button>
        ))}
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t("common:actions.close")}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3">
        {notice && (
          <p role="status" className="text-muted-foreground text-xs">
            {notice}
          </p>
        )}
        {draft}
        {status === "loading" && (
          <p role="status" className="text-muted-foreground text-xs">
            {t("common:documentComments.loading")}
          </p>
        )}
        {status === "error" && (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-muted-foreground text-xs">
              {t("common:documentComments.loadFailed")}
            </p>
            <Button type="button" size="xs" variant="outline" onClick={onRetry}>
              {t("common:error.tryAgain")}
            </Button>
          </div>
        )}
        {status === "ready" && threads.length === 0 && !draft && (
          <div className="flex flex-col gap-1 px-1 py-6 text-center">
            <p className="text-foreground text-sm">
              {t(
                filter === "open"
                  ? "common:documentComments.emptyOpen"
                  : "common:documentComments.emptyResolved",
              )}
            </p>
            {filter === "open" && canComment && (
              <p className="text-muted-foreground text-xs">
                {t("common:documentComments.emptyOpenHint")}
              </p>
            )}
          </div>
        )}
        {threads.length > 0 && (
          <ul className="flex flex-col gap-3">
            {threads.map((thread) => (
              <CommentThreadCard
                key={thread.id}
                thread={thread}
                active={thread.id === activeId}
                detached={detachedIds.has(thread.id)}
                canComment={canComment}
                currentUserId={currentUserId}
                members={members}
                actions={actions}
                onActivate={() => onActivate(thread.id)}
                onShow={() => onShow(thread.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
