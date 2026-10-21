import { Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NewWorkMenu } from "@/components/shared/new-work-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { TaskType } from "@/types/task";

export function ReleaseDetailEmpty({
  onCreate,
  onLink,
}: {
  onCreate?: (type: TaskType) => void;
  onLink?: (kind: "task" | "milestone") => void;
}) {
  const { t } = useTranslation();

  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Rocket aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base">
          {t("tasks:releases.detail.empty")}
        </EmptyTitle>
        <EmptyDescription>
          {t("tasks:releases.detail.emptyHint")}
        </EmptyDescription>
      </EmptyHeader>
      {onCreate || onLink ? (
        <EmptyContent>
          <NewWorkMenu variant="outline" onSelect={onCreate} onLink={onLink} />
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
