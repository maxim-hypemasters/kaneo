import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/get-initials";
import type Task from "@/types/task";

type Member = {
  userId: string;
  user?: { name?: string; image?: string | null };
};

// Integration-created work has no Kaneo reporter; its issue author stands in.
function issueAuthor(task: Task) {
  for (const link of task.externalLinks ?? []) {
    const author = link.metadata?.author;
    if (typeof author === "string" && author) return author;
  }
  return null;
}

export function TriageReporter({
  task,
  members,
}: {
  task: Task;
  members: readonly Member[] | undefined;
}) {
  const { t } = useTranslation();
  const reporter = task.createdBy
    ? members?.find((member) => member.userId === task.createdBy)?.user
    : undefined;
  const name = reporter?.name ?? issueAuthor(task);
  if (!name) return null;

  return (
    <span
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      title={t("tasks:triage.reportedBy", { name })}
    >
      <Avatar className="size-4">
        {reporter?.image ? <AvatarImage src={reporter.image} alt="" /> : null}
        <AvatarFallback className="text-[0.5rem]">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      {/* Narrow rows show just the name; the title keeps the full phrase. */}
      <span className="truncate sm:hidden">{name}</span>
      <span className="hidden truncate sm:inline">
        {t("tasks:triage.reportedBy", { name })}
      </span>
    </span>
  );
}
