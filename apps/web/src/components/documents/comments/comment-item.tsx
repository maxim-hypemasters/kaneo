import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MentionMember } from "@/components/task/extensions/mention-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { DocumentComment } from "@/fetchers/document-comment/types";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { CommentBody } from "./comment-body";
import { CommentComposer } from "./comment-composer";

// One comment in a thread. Its author can edit or delete it.
export function CommentItem({
  comment,
  own,
  members,
  onEdit,
  onDelete,
}: {
  comment: DocumentComment;
  // The viewer wrote it and may still comment on this document.
  own: boolean;
  members: MentionMember[];
  onEdit: (content: string) => Promise<void>;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const name = comment.userName || t("common:people.someone");

  return (
    <div className="group/comment flex gap-2">
      <Avatar className="mt-0.5 size-5 shrink-0">
        <AvatarImage src={comment.userImage ?? undefined} alt="" />
        <AvatarFallback className="text-[9px]">
          {getInitials(comment.userName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-6 items-center gap-1.5">
          <span className="truncate font-medium text-[13px] text-foreground">
            {name}
          </span>
          <time
            dateTime={comment.createdAt}
            title={formatDateTime(comment.createdAt)}
            className="shrink-0 text-muted-foreground text-xs"
          >
            {formatRelativeTime(comment.createdAt)}
          </time>
          {comment.editedAt && (
            <span
              className="shrink-0 text-muted-foreground text-xs"
              title={formatDateTime(comment.editedAt)}
            >
              {t("common:documentComments.edited")}
            </span>
          )}
          {own && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={t("common:documentComments.actions", { name })}
                    className="ms-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/comment:opacity-100 data-popup-open:opacity-100 max-md:opacity-100"
                  />
                }
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-36">
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <Pencil className="text-muted-foreground" />
                  {t("common:documentComments.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 />
                  {t("common:actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editing ? (
          <div className="mt-1">
            <CommentComposer
              initialContent={comment.content}
              placeholder={t("common:documentComments.placeholder")}
              submitLabel={t("common:documentComments.save")}
              failedMessage={t("common:documentComments.updateFailed")}
              members={members}
              autoFocus
              onSubmit={async (content) => {
                await onEdit(content);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <CommentBody content={comment.content} />
        )}
      </div>
    </div>
  );
}
