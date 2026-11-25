import { useTranslation } from "react-i18next";
import type { MentionMember } from "@/components/task/extensions/mention-list";
import { CommentComposer } from "./comment-composer";

// The comment being written on the text that was just selected.
export function NewThreadCard({
  quote,
  // The selection was longer than a comment can be attached to.
  truncated,
  failedMessage,
  members,
  onSubmit,
  onCancel,
}: {
  quote: string;
  truncated: boolean;
  failedMessage: string;
  members: MentionMember[];
  onSubmit: (content: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("common:documentComments.newThread")}
      className="flex flex-col gap-3 rounded-lg border border-ring/60 bg-background p-3 shadow-xs"
    >
      <blockquote className="line-clamp-3 border-info/60 border-s-2 ps-2 text-[13px] text-foreground/80">
        {quote}
      </blockquote>
      {truncated && (
        <p className="text-muted-foreground text-xs">
          {t("common:documentComments.selectionTruncated")}
        </p>
      )}
      <CommentComposer
        placeholder={t("common:documentComments.placeholder")}
        submitLabel={t("common:documentComments.submit")}
        failedMessage={failedMessage}
        members={members}
        autoFocus
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </section>
  );
}
