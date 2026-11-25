import { Check, CornerDownRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MentionMember } from "@/components/task/extensions/mention-list";
import { Button } from "@/components/ui/button";
import type {
  DocumentComment,
  DocumentCommentThread,
} from "@/fetchers/document-comment/types";
import { cn } from "@/lib/cn";
import { CommentComposer } from "./comment-composer";
import { CommentItem } from "./comment-item";

export type ThreadActions = {
  reply: (threadId: string, content: string) => Promise<void>;
  edit: (commentId: string, content: string) => Promise<void>;
  // Asks before deleting.
  remove: (comment: DocumentComment) => void;
  resolve: (threadId: string, resolved: boolean) => Promise<void>;
};

// A thread: the text it is about, its first comment and the replies.
export function CommentThreadCard({
  thread,
  active,
  // The quoted text is no longer in the document.
  detached,
  canComment,
  currentUserId,
  members,
  actions,
  onActivate,
  onShow,
}: {
  thread: DocumentCommentThread;
  active: boolean;
  detached: boolean;
  canComment: boolean;
  currentUserId: string | undefined;
  members: MentionMember[];
  actions: ThreadActions;
  onActivate: () => void;
  // Scrolls the document to the quoted text.
  onShow: () => void;
}) {
  const { t } = useTranslation();
  const [replying, setReplying] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveFailed, setResolveFailed] = useState(false);
  const card = useRef<HTMLElement>(null);
  const replyButton = useRef<HTMLButtonElement>(null);
  const wasReplying = useRef(false);
  const resolved = Boolean(thread.resolvedAt);

  useEffect(() => {
    if (active) card.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  // The reply field takes the place of the buttons; when it goes, focus
  // would otherwise be lost to the page.
  useEffect(() => {
    if (wasReplying.current && !replying) replyButton.current?.focus();
    wasReplying.current = replying;
  }, [replying]);

  async function setResolved(next: boolean) {
    setResolving(true);
    setResolveFailed(false);
    try {
      await actions.resolve(thread.id, next);
    } catch {
      setResolveFailed(true);
    } finally {
      setResolving(false);
    }
  }

  const item = (comment: DocumentComment) => (
    <CommentItem
      key={comment.id}
      comment={comment}
      own={
        canComment && Boolean(currentUserId) && comment.userId === currentUserId
      }
      members={members}
      onEdit={(content) => actions.edit(comment.id, content)}
      onDelete={() => actions.remove(comment)}
    />
  );

  return (
    <li>
      <article
        ref={card}
        aria-current={active ? "true" : undefined}
        data-thread={thread.id}
        className={cn(
          "flex scroll-my-3 flex-col gap-3 rounded-lg border bg-background p-3 transition-colors",
          active ? "border-ring/60 shadow-xs" : "border-border/70",
        )}
        onFocusCapture={onActivate}
      >
        {detached ? (
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs">
              {t("common:documentComments.detached")}
            </p>
            <blockquote className="line-clamp-3 border-border border-s-2 ps-2 text-[13px] text-muted-foreground">
              {thread.anchor.quote}
            </blockquote>
          </div>
        ) : (
          <button
            type="button"
            title={t("common:documentComments.showInDocument")}
            aria-label={t("common:documentComments.showQuote", {
              quote: thread.anchor.quote,
            })}
            className="line-clamp-3 rounded-sm border-warning/60 border-s-2 ps-2 text-start text-[13px] text-foreground/80 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              onActivate();
              onShow();
            }}
          >
            {thread.anchor.quote}
          </button>
        )}

        {item(thread)}
        {thread.replies.map(item)}

        {resolved && (
          <p className="text-muted-foreground text-xs">
            {t("common:documentComments.resolvedBy", {
              name: thread.resolvedByName || t("common:people.someone"),
            })}
          </p>
        )}
        {resolveFailed && (
          <p role="alert" className="text-destructive text-xs">
            {t("common:documentComments.resolveFailed")}
          </p>
        )}

        {canComment &&
          (replying ? (
            <CommentComposer
              placeholder={t("common:documentComments.replyPlaceholder")}
              submitLabel={t("common:documentComments.reply")}
              failedMessage={t("common:documentComments.postFailed")}
              members={members}
              autoFocus
              onSubmit={async (content) => {
                await actions.reply(thread.id, content);
                setReplying(false);
              }}
              onCancel={() => setReplying(false)}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                ref={replyButton}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setReplying(true)}
              >
                <CornerDownRight />
                {t("common:documentComments.reply")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="ms-auto"
                disabled={resolving}
                loading={resolving}
                onClick={() => void setResolved(!resolved)}
              >
                {resolved ? <RotateCcw /> : <Check />}
                {t(
                  resolved
                    ? "common:documentComments.reopen"
                    : "common:documentComments.resolve",
                )}
              </Button>
            </div>
          ))}
      </article>
    </li>
  );
}
